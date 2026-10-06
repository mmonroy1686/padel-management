---
feature: campeonatos-dia-del-torneo
type: plan
status: in-progress
date: 2026-10-06
branch: feat/campeonatos-dia-del-torneo
references: ./design.md, ../campeonatos-inscripcion/plan.md, ../lista-de-espera/design.md
---

# Campeonatos: sorteo, programación y día del torneo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/team-setup:execute` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el organizador lleve un campeonato desde la inscripción cerrada hasta los campeones: cabezas de serie y sorteo de zonas y llaves, programación automática de todos los partidos en canchas y horarios (con ajuste a mano), publicación del fixture con aviso a las parejas, carga de resultados con avance automático a la llave, una página pública en vivo para compartir, un modo TV y "Mis partidos" para el socio.

**Architecture:** El sorteo, el programador, los resultados y la tabla de zona son funciones puras en `lib/domain` (Vitest, incluido el caso del spec de 8 categorías × 12 parejas, 3 días y 3 canchas). Las Server Actions de `app/(club)/club/torneos/campeonatos/fixture-actions.ts` las corren y mandan el resultado a RPCs `security definer` (`save_championship_draw`, `save_championship_schedule`, `publish_championship`, `set_match_slot`, `set_match_pinned`, `start_match`, `record_match_result`, `record_walkover`, `close_championship_group`, `finish_championship`) que vuelven a validar las reglas obligatorias con `private.fail(code)` y guardan todo en una transacción. Tablas nuevas `championship_groups`, `championship_group_members`, `championship_matches`, `championship_match_sets`, con RLS de solo lectura. La página pública `/c/[code]` (y `/c/[code]/tv`) vive fuera de los grupos `(jugador)` y `(club)` y lee por `public_championship(code)`, la única función que `anon` puede ejecutar.

**Tech Stack:** Next.js 16.3 (App Router, Server Actions), React 19, TypeScript, Tailwind 4, Supabase (Postgres 17, Auth, Realtime), `@supabase/ssr`, Vitest + Testing Library, pgTAP, Playwright con Mailpit.

---

## Antes de empezar

- Rama: `feat/campeonatos-dia-del-torneo` (sale de `main`, que ya trae `campeonatos-inscripcion`, las tablas del admin y la lista de espera; el diseño aprobado está en `dc6668f`). Commits chicos; cada corte termina en verde. Se ejecuta de corrido, sin pedir confirmación entre cortes.
- Docker Desktop corriendo. El CLI de Supabase es devDependency: `npx supabase …` o los scripts de npm (`npm run test:db`, `npm run db:reset`, `npm run db:types`). No hay CLI global. `gh` no está instalado: el PR se abre y se marca listo desde GitHub.
- Windows: **los archivos con barras invertidas (`\ir` en los tests pgTAP) se escriben con la herramienta Write**, nunca con heredoc ni `sed`. Las rutas con paréntesis o corchetes (`app/(jugador)/…`, `[id]`, `[code]`) van entre comillas en bash. El código TypeScript de este plan no usa barras invertidas en expresiones regulares (usa `[0-9]` y `[.]`); las únicas son `\'` dentro de algunos nombres de test, así que esos archivos también van con Write.
- Next 16: antes de usar una API de Next, leer su guía en `node_modules/next/dist/docs/01-app/` (ver `AGENTS.md`). Las usadas acá: Server Actions (`01-getting-started/07-mutating-data.md`), layouts y páginas fuera de los grupos (`01-getting-started/03-layouts-and-pages.md`, `03-api-reference/03-file-conventions/route-groups.md`), `params` y `searchParams` como Promise (`03-api-reference/03-file-conventions/page.md`), `useRouter().refresh()` (`01-getting-started/04-linking-and-navigating.md`).
- Producción: las migraciones llegan con el merge (`migrate.yml`). **Nunca** correr `supabase link`, `db push` ni nada contra producción desde la máquina local. Las migraciones ya aplicadas **no se editan**: todo cambio es una migración nueva.
- Migraciones nuevas: `supabase/migrations/20261007000100_*.sql` … `20261007000170_*.sql` (todas posteriores a `20261006000190_championship_time_limit.sql`). Un arreglo de la revisión final va en `20261007000180_*.sql`. **El valor nuevo del enum va solo en su archivo**: `championship_fixture` de `notification_kind` en `…100`. Postgres no deja usar un valor de enum en la misma transacción que lo agrega y el CLI aplica cada archivo en su propia transacción. Si `db reset` falla con `unsafe use of new value`, algo de `…110` en adelante quedó en `…100`.
- Docs en español; identificadores, comentarios de SQL y de código en inglés.
- pgTAP: un test se corre con `npx supabase test db supabase/tests/database/<archivo>.test.sql`; todos con `npm run test:db`. Los tests de este plan incluyen, en este orden, `\ir helpers/slot.psql`, `\ir helpers/club.psql`, `\ir helpers/match.psql`, `\ir helpers/day_use.psql` (trae a Eva, staff de otro club) y `\ir helpers/championship.psql` (al que la Task 2 le suma `make_group`, `make_cmatch` y `finish_cmatch`).
- Cada migración nueva se aplica con `npm run db:reset` y después `npm run db:types` regenera `lib/supabase/database.types.ts`, que CI compara byte a byte: se commitea en la misma tarea.
- Datos del fixture pgTAP (club T, `helpers/club.psql` + `helpers/match.psql` + `helpers/day_use.psql` + `helpers/championship.psql`): **grilla 08:00–23:00 cada 90 min (08:00, 09:30, 11:00, 12:30, 14:00, 15:30, 17:00, 18:30, 20:00, 21:30)**, zona `America/Montevideo`; canchas `c0000000-0000-0000-0000-000000000001` (Cancha 1) y `…0002` (Cancha 2). Personas: Ana `…a1`, Bruno `…b1`, Gabi `…a2`, Hugo `…a3`, Iván `…a4`, Juli `…a5` (jugadores), Carla `…c1` (recepción), Dani `…d1` (admin), Omar `…f1` (no es miembro), Eva `…e1` (admin del club B). Filas de jugador: `c4a00000-0000-0000-0000-0000000000a1` (Ana) … `…a5` (Juli), `…b1` (Bruno) y de afuera `c4a00000-0000-0000-0000-000000000f01` Pedro (`099111001`), `…f02` Lucía, `…f03` Marta, `…f04` Nico, `…f05` Olga, `…f06` Raúl. En este documento `…a1` abrevia `00000000-0000-0000-0000-0000000000a1`; **en los archivos va siempre el uuid completo**.
- **Horas en pgTAP: solo horas de la grilla** (08:00, 09:30, 11:00, 12:30, 14:00, 15:30, 17:00, 18:30, 20:00, 21:30, y 23:00 como fin). Nunca 19:00, 10:00 ni ninguna otra hora fuera de la grilla en un literal. Los horarios imposibles (franjas de 2 horas desde las 08:00) se insertan leyendo `private.championship_blocks(…)`, nunca escribiendo la hora.
- Ids del fixture de este plan (hexadecimales, sin chocar con los existentes): campeonatos `c1a00000-…`, categorías `c2a00000-…`, parejas `c3a00000-…`, zonas `c5a00000-0000-0000-0000-00000000000N`, partidos `c6a00000-0000-0000-0000-00000000000N`.
- `now()` es fijo dentro de la transacción de cada test.
- La restricción de exclusión `championship_matches_one_court` es **diferida** (se revisa en el commit). Los pgTAP corren en una transacción que nunca hace commit, así que la cancha doble se prueba por `courts_busy` de `private.schedule_problem`, no por la restricción.
- Soporte e2e (`tests/e2e/support`): `createMember`, `signedInClient`, `clubRow`, `adminClient`, `signInWithMagicLink`, y de campeonatos `registerPairAs`, `categoryIdByName`, `uniquePhone`. **En e2e se navega con `page.goto`, nunca con clicks en las pestañas** (el indicador de Next tapa la de abajo a la izquierda).
- jsdom: los `select` se cambian con `userEvent.selectOptions`; los radios con `userEvent.click`. `navigator.share` y `navigator.clipboard` se definen en cada test con `Object.defineProperty(…, { configurable: true })` y se usa `fireEvent.click` (el `userEvent` reemplaza el portapapeles).

## Decisiones que este plan toma (y que el diseño no fijaba)

| Tema | Decisión | Por qué |
| --- | --- | --- |
| *Byes* | No hay partidos de *bye*: el clasificado con *bye* entra directo al partido de la ronda siguiente. Una fuente es `{"group": id, "place": n}` o `{"winner_of": id}`; en llave directa las parejas van en `entry_a_id`/`entry_b_id` desde el sorteo | Un partido que no se juega no se programa ni se muestra; `{"bye": true}` del diseño deja de hacer falta |
| Zonas | Menos de 6 parejas: una sola zona. Si no: `ceil(n/4)` zonas (o `floor(n/3)` con zonas de 3) combinando 3 y 4, las de 4 al final (10 = 3+3+4). Todos contra todos: "Zona única" | Diseño ("se combinan") |
| Cabezas de serie | Por defecto: `seed` del organizador primero (1, 2…), después la suma de categorías declaradas (menor primero) y la inscripción más vieja. Una por zona en orden (la 1 a la Zona A). El resto, por bombos de nivel mezclados con la semilla, en serpentina. `set_championship_seeds(categoría, parejas en orden)` con la inscripción cerrada o ya sorteado | Diseño |
| Semilla | Al azar en cada "Sortear" (`draw_seed`); cada categoría mezcla con `semilla ^ hash(id)` | Misma semilla, mismo sorteo; "Volver a sortear" cambia la semilla |
| Llave | Clasificados: todos los 1° (A, B, …), después todos los 2°…; orden estándar (1-8, 4-5, 2-7, 3-6), los *byes* para los mejores 1°; si dos de la misma zona se cruzan en la primera ronda se intercambia el de abajo con el de otro cruce. Nunca clasifican más de tamaño − 1 por zona; con un solo clasificado no hay llave | Diseño |
| Nombres provisorios | "1° Zona A", "Ganador SF1"; rondas "Final", "Semifinal 1", "Cuartos de final 2", "Octavos de final 3" (códigos F, SF, CF, OF) | Diseño |
| Quién ve el fixture | Staff siempre; los miembros desde que se publica (`published`, `in_progress`, `finished`) | Antes de publicar el sorteo se puede rehacer; el diseño decía "fuera de borrador" |
| Lugares sin definir en el programador | Cada lugar ("1° Zona A", "Ganador SF1") es una ficha: dos fichas distintas nunca son la misma pareja. Para choques entre categorías se toma a todos los jugadores de la zona; los horarios imposibles solo de parejas ya conocidas | Las obligatorias se cumplen pase quien pase; con la pareja sin definir no hay horarios que mirar |
| Descanso | 45 minutos entre partidos de la misma pareja; un jugador en dos categorías solo no se superpone | Diseño ("descanso por pareja") |
| Mover a mano | `set_match_slot` también fija el partido. Las opciones válidas las calcula la página (`slotOptions`) al abrir `?partido=<id>` | "Volver a programar" no deshace lo que el organizador eligió; sin acciones de lectura |
| Lo no ubicado | El motivo se calcula en la página con el programador (`unplacedReasons`), no se guarda | Siempre al día después de cada ajuste |
| Validación en SQL | `private.schedule_problem(campeonato, partido)` revisa, en este orden: dentro de un día de juego y sus canchas, en pasos de los minutos de la categoría (`outside_play_days`); una cancha, un partido (`courts_busy`); la llave después de lo que la define más 45 min (`too_early`); descanso y superposición de parejas conocidas y de jugadores en dos categorías (`pair_busy`); horarios imposibles (`unavailable_pair`). Al mover un partido, solo lo que lo involucra | "La RPC vuelve a validar"; un partido ya jugado no bloquea mover otro |
| Publicar | Exige todos los partidos ubicados (`schedule_incomplete`); crea `public_code` (nombre en minúsculas sin acentos, hasta 24 caracteres, guion y 4 al azar: `campeonato-t-7k2f`); aviso `championship_fixture` a los jugadores socios de cada pareja con lugar | Diseño |
| Devolver franjas | Opción al publicar: cada ocupación del campeonato se reemplaza por los turnos de la grilla del club que tienen un partido en esa cancha; la lista de espera ofrece el resto al hacer commit | Diseño |
| Resultados | Set a 6 con tie-break (6-0 a 6-4, 7-5, 7-6); tercer set súper tie-break a 10 por 2 o completo; con `time_limit_minutes` el último set puede quedar parcial y gana quien va arriba en sets y después en games (empate inválido). El súper tie-break cuenta como un game. Mismas reglas en `checkResult` (TS) y `private.match_winner` (SQL) | Diseño |
| W.O. | Se guarda como 6-0 6-0 para el que se presentó; `walkover_entry_id` es la pareja que no vino | Diseño ("W.O. cuenta 6-0 6-0") |
| Cierre de zona | TS calcula el orden (`closingOrder`); `close_championship_group` lo guarda (revalida: zona completa, todas sus parejas una vez, nadie arriba de quien ganó más) y completa la llave. "Cargar resultado" y "W.O." la cierran solas si no hay un empate que decida un lugar; si lo hay, la zona muestra "Cerrar zona" para que el organizador ordene | El sorteo del empate es del organizador desde la app |
| Corregir | Mientras el partido siguiente no empezó; corregir un partido de zona reabre la zona (borra puestos y las parejas que mandó a la llave) | Diseño |
| Finalizar | `in_progress` con todos los partidos terminados y todas las zonas cerradas (`scores_missing`) | Diseño |
| Público | `/c/[code]` y `/c/[code]/tv` fuera de los grupos, con su layout (logo y nombre del club, sin pestañas); `public_championship` devuelve zonas y partidos solo publicado, y nada de un borrador o cancelado | Diseño |
| Tiempo real | `LiveOccupancy` suma `championship_matches` y `championship_match_sets` (con `club_id`); va en la gestión y en `/campeonatos/[id]`. La pública y el modo TV se recargan cada 15 s | Diseño |
| Mis partidos | En Inicio los que faltan jugar de campeonatos publicados o en juego; en `/campeonatos/[id]` todos los del socio, con "Ver el fixture completo" y "Compartir" | Diseño |
| Códigos de error nuevos | `category_too_small`, `outside_play_days`, `pair_busy`, `unavailable_pair`, `too_early`, `schedule_incomplete`, `invalid_result`. Se reusan `courts_busy`, `scores_missing`, `invalid_state`, `invalid_input`, `forbidden`, `not_found` | `outside_window` ya existe (reservas) |
| Demo | "Copa de la Casa": hoy de 12:30 a 19:30 en las tres primeras canchas, partidos de 60 minutos (5ta Libre en dos zonas de 3 y final; 6ta Damas en llave directa). Se inserta antes que todo lo demás que toma canchas; el reloj de la demo queda entre las 15:00 y las 17:00 para que siempre haya terminados, uno en juego y próximos. El americano en juego pasa a las 20:00 y el partido abierto de hoy a la Cancha 3 | El diseño pide "canchas libres de la tarde" y los tres estados |
| PR | Un PR borrador desde el corte 1 (Task 3), listo al final | Igual que las fases anteriores |

## Mapa de archivos

| Archivo | Responsabilidad |
| --- | --- |
| `supabase/migrations/20261007000100_championship_fixture_kind.sql` | `notification_kind` suma `championship_fixture` (solo eso) |
| `supabase/migrations/20261007000110_championship_fixture.sql` | `public_code` y `draw_seed`; enums, tablas de zonas, partidos y sets; RLS (`private.fixture_visible`) y privilegios |
| `supabase/migrations/20261007000120_realtime_championship_fixture.sql` | Partidos y sets a Realtime |
| `supabase/migrations/20261007000130_championship_draw.sql` | `set_championship_seeds`, `save_championship_draw` y sus validaciones |
| `supabase/migrations/20261007000140_championship_schedule.sql` | `private.schedule_problem`, `save_championship_schedule`, `set_match_slot`, `set_match_pinned` |
| `supabase/migrations/20261007000150_championship_publish.sql` | `public_code`, devolver franjas, `publish_championship` |
| `supabase/migrations/20261007000160_championship_results.sql` | Reglas de resultado, `start_match`, `record_match_result`, `record_walkover`, `close_championship_group`, `finish_championship` |
| `supabase/migrations/20261007000170_public_championship.sql` | `public_championship(code)` para `anon` |
| `supabase/tests/database/helpers/championship.psql` | Suma `make_group`, `make_cmatch`, `finish_cmatch` |
| `supabase/tests/database/championship_{fixture_schema,draw,schedule,publish,results,public}.test.sql`, `realtime_championship_fixture.test.sql`, `integrity.test.sql` | pgTAP |
| `lib/domain/errors.ts` | Códigos nuevos |
| `lib/domain/championship-notifications.ts` | Aviso `championship_fixture` |
| `lib/domain/championships.ts`, `lib/data/championships.ts` | `seed` de cada pareja y `publicCode` del campeonato |
| `lib/domain/championship-fixture.ts` | Tipos del fixture, lectura de filas, nombres de partidos y lados, marcador |
| `lib/domain/championship-draw.ts` | Sorteo: zonas, serpentina, llave, *payload* de la RPC |
| `lib/domain/championship-results.ts` | Validación de resultados |
| `lib/domain/championship-standings.ts` | Tabla de zona, desempates, orden de cierre |
| `lib/domain/championship-schedule.ts` | Programador, opciones de un partido, motivos, revisión |
| `lib/domain/championship-views.ts` | Lo que muestran las pantallas: partidos, día del torneo, zonas, llaves, mis partidos, compartir |
| `lib/domain/championship-fixture-form.ts` | Lectura de los formularios del fixture |
| `lib/domain/championship-public.ts` | Lectura de `public_championship` |
| `lib/data/championship-fixture.ts` | Lecturas del fixture, la pública y los partidos del socio |
| `app/(club)/club/torneos/campeonatos/fixture-actions.ts` | Acciones del organizador |
| `components/ui/share-button.tsx`, `components/live/{auto-refresh,live-occupancy}.tsx` | Compartir; recarga cada 15 s; Realtime |
| `components/championships/{match-line,seeds-form,fixture-steps,zones-view,bracket-view,unplaced-list,fixture-table,move-match-sheet,result-sheet,walkover-sheet,group-order-form,match-day-board,my-matches}.tsx` | Pantallas del fixture |
| `app/(club)/club/torneos/campeonatos/[id]/page.tsx` | Gestión: sorteo, programación, publicación y día del torneo |
| `app/c/[code]/{layout,page,public-board}.tsx`, `app/c/[code]/tv/{page,tv-board}.tsx` | Público y modo TV |
| `app/(jugador)/campeonatos/[id]/page.tsx`, `app/(jugador)/page.tsx` | Mis partidos y compartir |
| `tests/unit/fixtures/{championships,championship-fixture}.ts` | Fixtures de Vitest |
| `scripts/demo-data.mjs` | Campeonato jugándose hoy |
| `tests/e2e/support/championships.ts`, `tests/e2e/championship-day.spec.ts` | Flujo e2e |

## Secuencia por cortes

| Corte | Tasks | Resultado | Cómo se prueba |
| --- | --- | --- | --- |
| 1. Modelo | 1–3 | Tablas, RLS, Realtime, el aviso nuevo en TS | pgTAP + Vitest |
| 2. RPCs | 4–8 | Cabezas de serie, sorteo, programación, publicación, resultados, zonas, final, página pública | pgTAP |
| 3. Dominio TS | 9–16 | Errores, fixture, sorteo, resultados, tablas, programador (caso del spec), vistas, formularios, lectura pública | Vitest |
| 4. Datos y acciones | 17–18 | Lecturas y Server Actions | Vitest + typecheck |
| 5. Pantallas del club | 19–24 | Compartir, cabezas de serie, pasos, zonas, llaves, fixture, mover, día del torneo, la página | Vitest |
| 6. Público y socio | 25–27 | `/c/[code]`, modo TV, Mis partidos | Vitest |
| 7. Demo, e2e y cierre | 28–30 | Demo de hoy, flujo completo, PR listo | Playwright |

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
Expected: `feat/campeonatos-dia-del-torneo`; el último commit es `docs: design championship draw, schedule and tournament day`; `db reset` aplica las migraciones hasta `20261006000190_championship_time_limit.sql` y `seed.sql`.

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

### Task 2: Zonas, partidos y sets en la base

**Files:**
- Modify: `supabase/tests/database/helpers/championship.psql` (al final)
- Create: `supabase/tests/database/championship_fixture_schema.test.sql`
- Create: `supabase/migrations/20261007000100_championship_fixture_kind.sql`
- Create: `supabase/migrations/20261007000110_championship_fixture.sql`

- [ ] **Step 1: Helpers del fixture** (con la herramienta Edit, al final del archivo)

Append to `supabase/tests/database/helpers/championship.psql`:
```sql

-- A group of a category with its pairs, in that draw order. Inserted as postgres.
create procedure test_helpers.make_group(p_id uuid, p_category_id uuid, p_name text, p_entries uuid[])
language sql
as $$
  insert into public.championship_groups (id, club_id, championship_id, category_id, name)
  select p_id, 'a0000000-0000-0000-0000-000000000001', c.championship_id, p_category_id, p_name
  from public.championship_categories c where c.id = p_category_id;
  insert into public.championship_group_members (group_id, club_id, entry_id, draw_position)
  select p_id, 'a0000000-0000-0000-0000-000000000001', e.id, e.n
  from unnest(p_entries) with ordinality as e (id, n);
$$;

-- A match of a category, inserted as postgres: a group match takes p_group_id, a knockout one p_round and
-- p_position (and its sources). With p_court and p_starts it lasts the category's minutes.
create procedure test_helpers.make_cmatch(
  p_id uuid,
  p_category_id uuid,
  p_entry_a uuid,
  p_entry_b uuid,
  p_group_id uuid default null,
  p_round integer default null,
  p_position integer default null,
  p_court uuid default null,
  p_starts timestamptz default null,
  p_source_a jsonb default null,
  p_source_b jsonb default null
)
language sql
as $$
  insert into public.championship_matches (id, club_id, championship_id, category_id, stage, group_id, round,
                                           bracket_position, entry_a_id, entry_b_id, source_a, source_b, court_id,
                                           starts_at, ends_at)
  select p_id, 'a0000000-0000-0000-0000-000000000001', c.championship_id, p_category_id,
         (case when p_group_id is null then 'knockout' else 'group' end)::public.championship_stage,
         p_group_id, p_round, p_position, p_entry_a, p_entry_b, p_source_a, p_source_b, p_court, p_starts,
         p_starts + make_interval(mins => c.match_minutes)
  from public.championship_categories c where c.id = p_category_id;
$$;

-- A match finished 6-3 6-3 for p_winner, inserted as postgres (skips the result rules on purpose).
create procedure test_helpers.finish_cmatch(p_id uuid, p_winner uuid)
language sql
as $$
  update public.championship_matches
     set status = 'finished', winner_entry_id = p_winner, recorded_at = now()
   where id = p_id;
  insert into public.championship_match_sets (match_id, club_id, set_number, games_a, games_b)
  select p_id, 'a0000000-0000-0000-0000-000000000001', n,
         case when m.entry_a_id = p_winner then 6 else 3 end, case when m.entry_a_id = p_winner then 3 else 6 end
  from public.championship_matches m cross join generate_series(1, 2) as n
  where m.id = p_id;
$$;
```

- [ ] **Step 2: Write the failing test** (con la herramienta Write)

`supabase/tests/database/championship_fixture_schema.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(18);

select has_table('public', 'championship_groups', 'championship_groups exists');
select has_table('public', 'championship_group_members', 'championship_group_members exists');
select has_table('public', 'championship_matches', 'championship_matches exists');
select has_table('public', 'championship_match_sets', 'championship_match_sets exists');
select ok('championship_fixture' = any (enum_range(null::public.notification_kind)::text[]),
  'the fixture aviso is one more kind of aviso');
select has_column('public', 'championships', 'public_code', 'a championship has a public code');
select has_column('public', 'championships', 'draw_seed', 'and the seed of its draw');
select ok((select condeferrable from pg_constraint where conname = 'championship_matches_one_court'),
  'one court, one match: checked when the transaction commits');

-- C1 is published: 'Libre' with Ana and Pedro, Bruno and Lucía in Zona A, their match on day 10 at 08:00 with
-- its two sets. C2 was drawn but not published: Gabi and Marta against Hugo and Nico.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001', 'published');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000001', 10, '08:00', '14:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02');
call test_helpers.make_group('c5a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'Zona A', array['c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002']::uuid[]);
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
  p_group_id => 'c5a00000-0000-0000-0000-000000000001', p_court => 'c0000000-0000-0000-0000-000000000001',
  p_starts => test_helpers.at(10, '08:00'));
call test_helpers.finish_cmatch('c6a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000001');

call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000002', 'drawn');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000002');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a2', 'c4a00000-0000-0000-0000-000000000f03');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a3', 'c4a00000-0000-0000-0000-000000000f04');
call test_helpers.make_group('c5a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000002',
  'Zona A', array['c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004']::uuid[]);
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000002',
  'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004',
  p_group_id => 'c5a00000-0000-0000-0000-000000000002');

select throws_ok(
  $$ insert into public.championship_matches (club_id, championship_id, category_id, stage, group_id, court_id)
     values ('a0000000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001',
             'c2a00000-0000-0000-0000-000000000001', 'group', 'c5a00000-0000-0000-0000-000000000001',
             'c0000000-0000-0000-0000-000000000001') $$,
  '23514', null, 'a match on a court has its start and its end');

set local role authenticated;

-- Ana, a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select is((select count(*)::int from public.championship_matches), 1,
  'a member reads the matches of a published championship, not of one only drawn');
select is((select count(*)::int from public.championship_groups), 1, 'and its groups');
select is((select count(*)::int from public.championship_group_members), 2, 'with their pairs');
select is((select count(*)::int from public.championship_match_sets), 2, 'and the sets of its matches');
select throws_ok($$ update public.championship_matches set pinned = true $$, '42501', null,
  'nobody writes the fixture directly');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select is((select count(*)::int from public.championship_matches), 2, 'staff read the drawn one too');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select is((select count(*)::int from public.championship_matches), 0, 'staff of another club read nothing');

reset role;
select ok(has_function_privilege('authenticated', 'private.fixture_visible(uuid)', 'execute'),
  'the read policies can ask who sees a fixture');

set local role anon;
select throws_ok($$ select count(*) from public.championship_matches $$, '42501', null,
  'anon reads no table of the fixture');

select * from finish();
rollback;
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/championship_fixture_schema.test.sql`
Expected: FAIL — `relation "public.championship_groups" does not exist` (el helper ya no compila).

- [ ] **Step 4: El tipo de aviso, solo en su archivo**

`supabase/migrations/20261007000100_championship_fixture_kind.sql`:
```sql
-- Campeonatos, día del torneo, part 0: "the fixture is out" goes through the same outbox as the other avisos.
-- Alone in its file: Postgres does not let a transaction use an enum value it just added, and the CLI runs each
-- migration in one transaction.
alter type public.notification_kind add value 'championship_fixture';
```

- [ ] **Step 5: Las tablas**

`supabase/migrations/20261007000110_championship_fixture.sql`:
```sql
-- Campeonatos, día del torneo, part 1: the draw and the fixture. A category is drawn into groups (its pairs in
-- draw order) and a bracket; every match has a court, a start and a state, and its result is a list of sets. A
-- side not known yet says where it comes from: {"group": <group id>, "place": 1} or {"winner_of": <match id>}.
-- Every write goes through the functions of the next migrations: authenticated only reads.

alter table public.championships
  add column public_code text unique
    check (public_code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(public_code) between 3 and 40),
  add column draw_seed integer;

create type public.championship_stage as enum ('group', 'knockout');
create type public.championship_match_status as enum ('scheduled', 'playing', 'finished', 'walkover');

create table public.championship_groups (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  championship_id uuid not null,
  category_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 40),
  sort_order smallint not null default 0,
  -- Target for the composite FKs of members and matches.
  unique (id, club_id),
  unique (category_id, name),
  constraint championship_groups_championship_in_club
    foreign key (championship_id, club_id) references public.championships (id, club_id) on delete cascade,
  constraint championship_groups_category_in_club
    foreign key (category_id, club_id) references public.championship_categories (id, club_id) on delete cascade
);
create index championship_groups_championship_id_idx on public.championship_groups (championship_id);
create index championship_groups_category_id_idx on public.championship_groups (category_id);
alter table public.championship_groups enable row level security;

create table public.championship_group_members (
  group_id uuid not null,
  club_id uuid not null,
  entry_id uuid not null,
  draw_position smallint not null check (draw_position >= 1),
  -- Its final place, once the organizer closed the group (close_championship_group).
  place smallint check (place >= 1),
  primary key (group_id, entry_id),
  unique (group_id, draw_position),
  unique (group_id, place),
  constraint championship_group_members_group_in_club
    foreign key (group_id, club_id) references public.championship_groups (id, club_id) on delete cascade,
  constraint championship_group_members_entry_in_club
    foreign key (entry_id, club_id) references public.championship_entries (id, club_id) on delete cascade
);
create index championship_group_members_entry_id_idx on public.championship_group_members (entry_id);
alter table public.championship_group_members enable row level security;

create table public.championship_matches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  championship_id uuid not null,
  category_id uuid not null,
  stage public.championship_stage not null,
  group_id uuid,
  -- Knockout: 1 = final, 2 = semifinals, 4 = quarterfinals...; bracket_position goes from 1 to round.
  round smallint check (round >= 1),
  bracket_position smallint check (bracket_position >= 1),
  entry_a_id uuid,
  entry_b_id uuid,
  source_a jsonb,
  source_b jsonb,
  court_id uuid references public.courts (id),
  starts_at timestamptz,
  ends_at timestamptz,
  -- "Volver a programar" leaves a pinned match where it is.
  pinned boolean not null default false,
  status public.championship_match_status not null default 'scheduled',
  winner_entry_id uuid,
  -- W.O.: the pair that did not show up.
  walkover_entry_id uuid,
  recorded_by uuid references public.profiles (id) on delete set null,
  recorded_at timestamptz,
  -- Target for the composite FK of sets.
  unique (id, club_id),
  constraint championship_matches_championship_in_club
    foreign key (championship_id, club_id) references public.championships (id, club_id) on delete cascade,
  constraint championship_matches_category_in_club
    foreign key (category_id, club_id) references public.championship_categories (id, club_id) on delete cascade,
  constraint championship_matches_group_in_club
    foreign key (group_id, club_id) references public.championship_groups (id, club_id) on delete cascade,
  constraint championship_matches_entry_a_in_club
    foreign key (entry_a_id, club_id) references public.championship_entries (id, club_id) on delete cascade,
  constraint championship_matches_entry_b_in_club
    foreign key (entry_b_id, club_id) references public.championship_entries (id, club_id) on delete cascade,
  constraint championship_matches_winner_in_club
    foreign key (winner_entry_id, club_id) references public.championship_entries (id, club_id) on delete cascade,
  constraint championship_matches_stage check (
    (stage = 'group' and group_id is not null and round is null and bracket_position is null)
    or (stage = 'knockout' and group_id is null and round is not null and bracket_position is not null
        and bracket_position <= round)
  ),
  constraint championship_matches_two_pairs check (entry_a_id is null or entry_b_id is null or entry_a_id <> entry_b_id),
  constraint championship_matches_slot check (
    (court_id is null) = (starts_at is null) and (starts_at is null) = (ends_at is null)
    and (starts_at is null or starts_at < ends_at)
  ),
  constraint championship_matches_pinned check (not pinned or court_id is not null),
  constraint championship_matches_result check (
    (status in ('finished', 'walkover')) = (winner_entry_id is not null)
    and (status = 'walkover') = (walkover_entry_id is not null)
  ),
  -- Deferred: a whole schedule is saved at once, and two matches may swap courts on the way.
  constraint championship_matches_one_court
    exclude using gist (court_id with =, (tstzrange(starts_at, ends_at)) with &&)
    where (court_id is not null) deferrable initially deferred
);
create index championship_matches_championship_id_idx on public.championship_matches (championship_id);
create index championship_matches_category_id_idx on public.championship_matches (category_id);
create index championship_matches_group_id_idx on public.championship_matches (group_id);
create index championship_matches_entry_a_id_idx on public.championship_matches (entry_a_id);
create index championship_matches_entry_b_id_idx on public.championship_matches (entry_b_id);
alter table public.championship_matches enable row level security;

create table public.championship_match_sets (
  match_id uuid not null,
  club_id uuid not null,
  set_number smallint not null check (set_number between 1 and 3),
  games_a smallint not null check (games_a between 0 and 99),
  games_b smallint not null check (games_b between 0 and 99),
  super_tiebreak boolean not null default false,
  primary key (match_id, set_number),
  constraint championship_match_sets_match_in_club
    foreign key (match_id, club_id) references public.championship_matches (id, club_id) on delete cascade
);
alter table public.championship_match_sets enable row level security;

-- Staff see the fixture of their club's championships from the draw on; members, once it is published (until
-- then the organizer may draw again).
create function private.fixture_visible(p_championship_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.championships ch
    where ch.id = p_championship_id
      and (
        private.has_club_role(ch.club_id, array['admin', 'reception']::public.club_role[])
        or (ch.status in ('published', 'in_progress', 'finished') and private.is_club_member(ch.club_id))
      )
  );
$$;

revoke all on function private.fixture_visible(uuid) from public;
grant execute on function private.fixture_visible(uuid) to authenticated;

revoke all on public.championship_groups, public.championship_group_members, public.championship_matches,
  public.championship_match_sets from anon, authenticated;
grant select on public.championship_groups, public.championship_group_members, public.championship_matches,
  public.championship_match_sets to authenticated;

create policy championship_groups_select on public.championship_groups
  for select to authenticated using (private.fixture_visible(championship_id));
-- Members and sets follow their group and match (the subquery goes through their RLS).
create policy championship_group_members_select on public.championship_group_members
  for select to authenticated
  using (exists (select 1 from public.championship_groups g where g.id = group_id));
create policy championship_matches_select on public.championship_matches
  for select to authenticated using (private.fixture_visible(championship_id));
create policy championship_match_sets_select on public.championship_match_sets
  for select to authenticated
  using (exists (select 1 from public.championship_matches m where m.id = match_id));
```

- [ ] **Step 6: Run test to verify it passes**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/championship_fixture_schema.test.sql
npm run test:db
```
Expected: PASS (18 tests) y el resto de los pgTAP sigue en verde.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261007000100_championship_fixture_kind.sql supabase/migrations/20261007000110_championship_fixture.sql supabase/tests/database/helpers/championship.psql supabase/tests/database/championship_fixture_schema.test.sql
git commit -m "feat(db): championship groups, matches and sets with their RLS"
```

---

### Task 3: Tipos, aviso del fixture y tiempo real

**Files:**
- Create: `supabase/migrations/20261007000120_realtime_championship_fixture.sql`
- Create: `supabase/tests/database/realtime_championship_fixture.test.sql`
- Modify: `lib/supabase/database.types.ts` (generado)
- Modify: `lib/domain/championship-notifications.ts`
- Modify: `components/live/live-occupancy.tsx`
- Test: `tests/unit/lib/domain/notifications.test.ts`, `tests/unit/components/live/live-occupancy.test.tsx`

- [ ] **Step 1: Write the failing pgTAP test** (con la herramienta Write)

`supabase/tests/database/realtime_championship_fixture.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select is(
  (select count(*)::int from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public'
     and tablename in ('championship_matches', 'championship_match_sets')),
  2, 'match and set changes are published to Realtime');
select is(
  (select array_agg(relreplident::text order by relname) from pg_class
   where oid in ('public.championship_matches'::regclass, 'public.championship_match_sets'::regclass)),
  array['d', 'd'], 'both keep the default replica identity');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx supabase test db supabase/tests/database/realtime_championship_fixture.test.sql`
Expected: FAIL — `have: 0, want: 2`.

- [ ] **Step 3: Partidos y sets a Realtime**

`supabase/migrations/20261007000120_realtime_championship_fixture.sql`:
```sql
-- The organizer's day board, the member's championship page and the club grid reload when a match or a set
-- changes. Realtime applies the select policies (private.fixture_visible) to the rows it streams.
alter publication supabase_realtime add table public.championship_matches, public.championship_match_sets;
```

- [ ] **Step 4: Run it, then regenerate the types**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/realtime_championship_fixture.test.sql
npm run db:types
npm run typecheck
```
Expected: PASS (2 tests). `typecheck` FALLA en `lib/data/waitlist.ts` y `lib/notify/outbox.ts`: `"championship_fixture"` no entra en `NotificationKind`. Lo arregla el Step 6.

- [ ] **Step 5: Write the failing unit tests**

Append to `tests/unit/lib/domain/notifications.test.ts`:
```ts

describe('the fixture aviso', () => {
  it('tells each pair the fixture is out', () => {
    expect(notificationContent('championship_fixture', ADDED, TIMEZONE)).toEqual({
      title: 'Ya está el fixture de Campeonato de Primavera',
      body: '6ta Libre, con Ana. Mirá tus partidos, canchas y horarios en el campeonato.',
      button: 'Ver el campeonato',
      reason: 'te escribimos por tu inscripción en un campeonato.',
    })
  })
})
```

Append to `tests/unit/components/live/live-occupancy.test.tsx`:
```tsx

describe('LiveOccupancy and the championships', () => {
  beforeEach(() => {
    mocks.handlers.length = 0
    mocks.calls.length = 0
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('listens to the matches of the championships and their sets', async () => {
    render(<LiveOccupancy clubId="club-1" />)
    await settle()
    for (const table of ['championship_matches', 'championship_match_sets']) {
      expect(mocks.channel.on).toHaveBeenCalledWith(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: 'club_id=eq.club-1' },
        expect.any(Function),
      )
    }
  })
})
```

Run: `npx vitest run tests/unit/lib/domain/notifications.test.ts tests/unit/components/live/live-occupancy.test.tsx`
Expected: FAIL — `notificationContent('championship_fixture', …)` devuelve `null` y no hay suscripción a `championship_matches`.

- [ ] **Step 6: El aviso del fixture**

In `lib/domain/championship-notifications.ts`, replace:
```ts
  'championship_cancelled',
] as const
```
with:
```ts
  'championship_cancelled',
  'championship_fixture',
] as const
```

In `lib/domain/championship-notifications.ts`, replace:
```ts
    case 'championship_cancelled':
      return {
        title: `Se canceló ${where}`,
        body: `${data.categoryName ? `${data.championshipName}. ` : ''}Si ya pagaste, el club te devuelve la plata.`,
      }
```
with:
```ts
    case 'championship_cancelled':
      return {
        title: `Se canceló ${where}`,
        body: `${data.categoryName ? `${data.championshipName}. ` : ''}Si ya pagaste, el club te devuelve la plata.`,
      }
    case 'championship_fixture':
      return {
        title: `Ya está el fixture de ${data.championshipName}`,
        body: `${where}${withPartner}. Mirá tus partidos, canchas y horarios en el campeonato.`,
      }
```

- [ ] **Step 7: Realtime de partidos y sets**

In `components/live/live-occupancy.tsx`, replace:
```tsx
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'slot_waits', filter: `club_id=eq.${clubId}` },
          reload,
        )
        .subscribe()
```
with:
```tsx
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'slot_waits', filter: `club_id=eq.${clubId}` },
          reload,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'championship_matches', filter: `club_id=eq.${clubId}` },
          reload,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'championship_match_sets', filter: `club_id=eq.${clubId}` },
          reload,
        )
        .subscribe()
```

In `components/live/live-occupancy.tsx`, replace:
```tsx
// its spots, a tournament, an entry, a game, a day use pass or a wait changes. It does not patch state by
```
with:
```tsx
// its spots, a tournament, an entry, a game, a day use pass, a wait, a championship match or one of its sets
// changes. It does not patch state by
```

- [ ] **Step 8: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/lib/domain/notifications.test.ts tests/unit/components/live/live-occupancy.test.tsx
npm run typecheck
npm run lint
```
Expected: PASS; typecheck y lint sin errores.

- [ ] **Step 9: Commit y PR borrador**

```bash
git add supabase/migrations/20261007000120_realtime_championship_fixture.sql supabase/tests/database/realtime_championship_fixture.test.sql lib/supabase/database.types.ts lib/domain/championship-notifications.ts components/live/live-occupancy.tsx tests/unit/lib/domain/notifications.test.ts tests/unit/components/live/live-occupancy.test.tsx
git commit -m "feat: fixture aviso and realtime for championship matches"
git push -u origin feat/campeonatos-dia-del-torneo
```
Abrir el PR borrador desde GitHub ("Campeonatos: sorteo, programación y día del torneo"), con el link a `docs/features/campeonatos-dia-del-torneo/design.md`.

---

## Corte 2: RPCs

### Task 4: Cabezas de serie y sorteo

**Files:**
- Create: `supabase/tests/database/championship_draw.test.sql`
- Create: `supabase/migrations/20261007000130_championship_draw.sql`
- Modify: `lib/supabase/database.types.ts` (generado)

- [ ] **Step 1: Write the failing test** (con la herramienta Write)

`supabase/tests/database/championship_draw.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(21);

-- C1: registration closed, a day of play and 'Libre' (groups of 4, 2 qualify) with four pairs with a place:
-- Ana and Pedro (E1), Bruno and Lucía (E2), Gabi and Marta (E3), Hugo and Nico (E4); Iván and Olga (E5) wait.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001', 'closed');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000001', 10, '08:00', '23:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a2', 'c4a00000-0000-0000-0000-000000000f03');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a3', 'c4a00000-0000-0000-0000-000000000f04');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000005', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a4', 'c4a00000-0000-0000-0000-000000000f05', 'waiting');
-- C2: closed, its only category has one pair (Juli and Raúl). C3: still taking sign-ups.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000002', 'closed');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000002',
  '5ta');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000006', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a5', 'c4a00000-0000-0000-0000-000000000f06');
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000003');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000003', 'c1a00000-0000-0000-0000-000000000003');
-- C4: closed, 'Llave' by direct knockout with three pairs (E7, E8, E9).
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000004', 'closed');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000004', 'c1a00000-0000-0000-0000-000000000004',
  'Llave');
update public.championship_categories set format = 'knockout' where id = 'c2a00000-0000-0000-0000-000000000004';
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000007', 'c2a00000-0000-0000-0000-000000000004',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000008', 'c2a00000-0000-0000-0000-000000000004',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000009', 'c2a00000-0000-0000-0000-000000000004',
  'c4a00000-0000-0000-0000-0000000000a2', 'c4a00000-0000-0000-0000-000000000f03');

-- A draw of one group 'A' with p_entries, each pair of them once and (unless told otherwise) a final between
-- its 1st and its 2nd, as lib/domain/championship-draw.ts sends it.
create function test_helpers.group_draw(p_category_id uuid, p_entries uuid[], p_final boolean default true)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'category_id', p_category_id,
    'groups', jsonb_build_array(jsonb_build_object('key', 'A', 'name', 'Zona A', 'entry_ids', to_jsonb(p_entries))),
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object('key', 'A' || n, 'stage', 'group', 'group', 'A', 'entry_a', a,
                                          'entry_b', b) order by n)
      from (
        select x.a, y.b, row_number() over (order by x.i, y.j) as n
        from unnest(p_entries) with ordinality as x (a, i)
        join unnest(p_entries) with ordinality as y (b, j) on y.j > x.i
      ) as pairs
    ), '[]'::jsonb) || case when p_final then jsonb_build_array(jsonb_build_object(
      'key', 'F', 'stage', 'knockout', 'round', 1, 'position', 1,
      'source_a', jsonb_build_object('group', 'A', 'place', 1),
      'source_b', jsonb_build_object('group', 'A', 'place', 2))) else '[]'::jsonb end
  );
$$;

-- 'Libre' with its four pairs with a place.
create function test_helpers.libre_draw()
returns jsonb
language sql
immutable
as $$
  select test_helpers.group_draw('c2a00000-0000-0000-0000-000000000001',
    array['c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
          'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004']::uuid[]);
$$;

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select throws_ok(
  format('select public.save_championship_draw(%L, 1, %L)', 'c1a00000-0000-0000-0000-000000000003',
         jsonb_build_array(test_helpers.group_draw('c2a00000-0000-0000-0000-000000000003', array[]::uuid[], false))),
  'P0001', 'invalid_state', 'nothing is drawn while registration is open');
select throws_ok(
  $$ select public.save_championship_draw('c1a00000-0000-0000-0000-000000000002', 1, '[]') $$,
  'P0001', 'category_too_small', 'a category with fewer than 2 pairs is merged or cancelled first');
select throws_ok(
  $$ select public.set_championship_seeds('c2a00000-0000-0000-0000-000000000001',
       array['c3a00000-0000-0000-0000-000000000005']::uuid[]) $$,
  'P0001', 'invalid_input', 'a pair in line is no seed');
select lives_ok(
  $$ select public.set_championship_seeds('c2a00000-0000-0000-0000-000000000001',
       array['c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000001']::uuid[]) $$,
  'the organizer sets the seeds before the draw');
select results_eq(
  $$ select id, seed::int from public.championship_entries
     where category_id = 'c2a00000-0000-0000-0000-000000000001' and seed is not null order by seed $$,
  $$ values ('c3a00000-0000-0000-0000-000000000003'::uuid, 1), ('c3a00000-0000-0000-0000-000000000001'::uuid, 2) $$,
  'in the order given');
select throws_ok(
  $$ select public.save_championship_draw('c1a00000-0000-0000-0000-000000000001', 1, '[]') $$,
  'P0001', 'invalid_input', 'every open category is drawn');
select throws_ok(
  format('select public.save_championship_draw(%L, 1, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(test_helpers.group_draw('c2a00000-0000-0000-0000-000000000001',
           array['c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
                 'c3a00000-0000-0000-0000-000000000003']::uuid[]))),
  'P0001', 'invalid_input', 'no pair with a place is left out');
select throws_ok(
  format('select public.save_championship_draw(%L, 1, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(test_helpers.group_draw('c2a00000-0000-0000-0000-000000000001',
           array['c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
                 'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000005']::uuid[]))),
  'P0001', 'invalid_input', 'and a pair in line does not play');
select throws_ok(
  format('select public.save_championship_draw(%L, 1, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(jsonb_set(test_helpers.libre_draw(), '{matches}',
                                     (test_helpers.libre_draw() -> 'matches') - 0))),
  'P0001', 'invalid_input', 'each pair of a group plays the others once');
select throws_ok(
  format('select public.save_championship_draw(%L, 1, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(jsonb_set(test_helpers.libre_draw(), '{matches,6,source_b,place}', '9'))),
  'P0001', 'invalid_input', 'the bracket only waits for places the group has');
select lives_ok(
  format('select public.save_championship_draw(%L, 42, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(test_helpers.libre_draw())),
  'a draw that keeps the rules is saved');
select is((select status::text || ' ' || draw_seed from public.championships
           where id = 'c1a00000-0000-0000-0000-000000000001'),
  'drawn 42', 'the championship is drawn, with its seed');
select is((select count(*)::int from public.championship_groups
           where category_id = 'c2a00000-0000-0000-0000-000000000001'), 1, 'one group');
select is((select count(*)::int from public.championship_matches
           where category_id = 'c2a00000-0000-0000-0000-000000000001' and stage = 'group'), 6, 'six group matches');
select results_eq(
  $$ select m.source_a ->> 'place', m.source_b ->> 'place', (m.source_a ->> 'group')::uuid = g.id
     from public.championship_matches m
     join public.championship_groups g on g.category_id = m.category_id
     where m.category_id = 'c2a00000-0000-0000-0000-000000000001' and m.stage = 'knockout' $$,
  $$ values ('1', '2', true) $$,
  'the final waits for the 1st and the 2nd of the group');
select lives_ok(
  format('select public.save_championship_draw(%L, 7, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(test_helpers.libre_draw())),
  'drawing again replaces the draw while it is not published');
select is((select count(*)::int from public.championship_matches
           where championship_id = 'c1a00000-0000-0000-0000-000000000001'), 7,
  'with nothing left of the first one');
select lives_ok(
  format('select public.save_championship_draw(%L, 3, %L)', 'c1a00000-0000-0000-0000-000000000004',
    jsonb_build_array(jsonb_build_object(
      'category_id', 'c2a00000-0000-0000-0000-000000000004', 'groups', '[]'::jsonb,
      'matches', jsonb_build_array(
        jsonb_build_object('key', 'SF2', 'stage', 'knockout', 'round', 2, 'position', 2,
                           'entry_a', 'c3a00000-0000-0000-0000-000000000008',
                           'entry_b', 'c3a00000-0000-0000-0000-000000000009'),
        jsonb_build_object('key', 'F', 'stage', 'knockout', 'round', 1, 'position', 1,
                           'entry_a', 'c3a00000-0000-0000-0000-000000000007',
                           'source_b', jsonb_build_object('winner_of', 'SF2')))))),
  'a direct knockout puts the top seed straight into the final when it has a bye');
select results_eq(
  $$ select entry_a_id, (source_b ->> 'winner_of')::uuid = (
       select id from public.championship_matches
       where category_id = 'c2a00000-0000-0000-0000-000000000004' and round = 2)
     from public.championship_matches
     where category_id = 'c2a00000-0000-0000-0000-000000000004' and round = 1 $$,
  $$ values ('c3a00000-0000-0000-0000-000000000007'::uuid, true) $$,
  'and the final waits for the winner of the semifinal');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok(
  format('select public.save_championship_draw(%L, 1, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(test_helpers.libre_draw())),
  'P0001', 'forbidden', 'staff of another club cannot draw');

-- Ana, a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  format('select public.save_championship_draw(%L, 1, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(test_helpers.libre_draw())),
  'P0001', 'forbidden', 'nor can a member');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/championship_draw.test.sql`
Expected: FAIL — `function public.save_championship_draw(unknown, integer, unknown) does not exist`.

- [ ] **Step 3: Write minimal implementation**

`supabase/migrations/20261007000130_championship_draw.sql`:
```sql
-- Campeonatos, día del torneo, part 2: seeds and the draw. lib/domain/championship-draw.ts draws (pure and
-- seeded); save_championship_draw checks that the result keeps the rules and saves it, replacing an earlier draw
-- while the fixture is not published.

-- A uuid from a jsonb string; null for a missing value, invalid_input for anything else.
create function private.json_uuid(p_value jsonb)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_value) <> 'string'
     or (p_value #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    perform private.fail('invalid_input');
  end if;
  return (p_value #>> '{}')::uuid;
end;
$$;

-- The organizer's seeds of a category, strongest first (1, 2, ...); every other pair goes back to none. With
-- registration closed, or drawn (the next draw uses them).
create function public.set_championship_seeds(p_category_id uuid, p_entry_ids uuid[])
returns integer
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
  if v_championship.status not in ('closed', 'drawn') then
    perform private.fail('invalid_state');
  end if;
  if p_entry_ids is null or cardinality(p_entry_ids) > 64 or array_position(p_entry_ids, null) is not null
     or (select count(distinct e) from unnest(p_entry_ids) as e) <> cardinality(p_entry_ids)
     or exists (
       select 1 from unnest(p_entry_ids) as e (id)
       where not exists (
         select 1 from public.championship_entries ce
         where ce.id = e.id and ce.category_id = v_category.id and ce.status = 'active'
       )
     ) then
    perform private.fail('invalid_input');
  end if;

  update public.championship_entries set seed = null where category_id = v_category.id and seed is not null;
  update public.championship_entries ce set seed = s.n
    from unnest(p_entry_ids) with ordinality as s (id, n)
   where ce.id = s.id;
  return cardinality(p_entry_ids);
end;
$$;

-- A side's source as the draw sends it ({"group": "A", "place": 1} or {"winner_of": "K2-1"}), with the keys
-- turned into the ids just saved.
create function private.draw_source(p_source jsonb, p_groups jsonb, p_matches jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_source is null or jsonb_typeof(p_source) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_source) = 'object' and p_source ? 'group' and p_groups ? (p_source ->> 'group')
     and coalesce(p_source ->> 'place', '') ~ '^[1-9]$' then
    return jsonb_build_object('group', p_groups -> (p_source ->> 'group'), 'place', (p_source ->> 'place')::integer);
  end if;
  if jsonb_typeof(p_source) = 'object' and p_source ? 'winner_of' and p_matches ? (p_source ->> 'winner_of') then
    return jsonb_build_object('winner_of', p_matches -> (p_source ->> 'winner_of'));
  end if;
  perform private.fail('invalid_input');
end;
$$;

-- True when a saved draw breaks a rule (lib/domain/championship-draw.ts never does): each pair with a place is
-- drawn exactly once and nobody else is; a format with groups has them (round robin, one) and each group plays
-- every pair of its members once; a knockout side is a pair or comes from somewhere, never both; a winner comes
-- from the round before, a place from a group that has it; one final; no source is used twice.
create function private.draw_problem(p_category public.championship_categories)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    exists (
      select 1 from public.championship_entries e
      where e.category_id = p_category.id and e.status = 'active'
        and (case
               when p_category.format = 'knockout' then
                 (select count(*) from public.championship_matches m
                  where m.category_id = p_category.id and e.id in (m.entry_a_id, m.entry_b_id))
               else
                 (select count(*) from public.championship_group_members gm
                  join public.championship_groups g on g.id = gm.group_id
                  where g.category_id = p_category.id and gm.entry_id = e.id)
             end) <> 1
    )
    or exists (
      select 1 from public.championship_group_members gm
      join public.championship_groups g on g.id = gm.group_id
      join public.championship_entries e on e.id = gm.entry_id
      where g.category_id = p_category.id and (e.category_id <> p_category.id or e.status <> 'active')
    )
    or exists (
      select 1 from public.championship_matches m
      join public.championship_entries e on e.id in (m.entry_a_id, m.entry_b_id)
      where m.category_id = p_category.id and (e.category_id <> p_category.id or e.status <> 'active')
    )
    or ((p_category.format = 'knockout')
        <> (not exists (select 1 from public.championship_groups g where g.category_id = p_category.id)))
    or (p_category.format = 'round_robin'
        and (select count(*) from public.championship_groups g where g.category_id = p_category.id) <> 1)
    or exists (
      select 1 from public.championship_matches m
      where m.category_id = p_category.id and m.stage = 'group'
        and (m.entry_a_id is null or m.entry_b_id is null
             or not exists (select 1 from public.championship_group_members gm
                            where gm.group_id = m.group_id and gm.entry_id = m.entry_a_id)
             or not exists (select 1 from public.championship_group_members gm
                            where gm.group_id = m.group_id and gm.entry_id = m.entry_b_id))
    )
    or exists (
      select 1 from public.championship_groups g
      cross join lateral (
        select count(*) as size from public.championship_group_members gm where gm.group_id = g.id
      ) as members
      cross join lateral (
        select count(*) as total,
               count(distinct least(m.entry_a_id::text, m.entry_b_id::text)
                              || greatest(m.entry_a_id::text, m.entry_b_id::text)) as pairs
        from public.championship_matches m where m.group_id = g.id
      ) as played
      where g.category_id = p_category.id
        and (played.total <> members.size * (members.size - 1) / 2 or played.pairs <> played.total)
    )
    or (p_category.format = 'round_robin'
        and exists (select 1 from public.championship_matches m
                    where m.category_id = p_category.id and m.stage = 'knockout'))
    or exists (
      select 1 from public.championship_matches m
      cross join lateral (values (m.entry_a_id, m.source_a), (m.entry_b_id, m.source_b)) as s (entry_id, source)
      where m.category_id = p_category.id and m.stage = 'knockout'
        and ((s.entry_id is null) = (s.source is null)
             or (s.source ? 'winner_of' and not exists (
                   select 1 from public.championship_matches f
                   where f.id = (s.source ->> 'winner_of')::uuid and f.category_id = p_category.id
                     and f.stage = 'knockout' and f.round = m.round * 2))
             or (s.source ? 'group' and not exists (
                   select 1 from public.championship_groups g
                   where g.id = (s.source ->> 'group')::uuid and g.category_id = p_category.id
                     and (s.source ->> 'place')::integer
                         < (select count(*) from public.championship_group_members gm where gm.group_id = g.id))))
    )
    or (exists (select 1 from public.championship_matches m
                where m.category_id = p_category.id and m.stage = 'knockout')
        and (select count(*) from public.championship_matches m
             where m.category_id = p_category.id and m.round = 1) <> 1)
    or exists (
      select 1 from public.championship_matches m
      cross join lateral (values (m.source_a), (m.source_b)) as s (source)
      where m.category_id = p_category.id and s.source is not null
      group by s.source
      having count(*) > 1
    );
$$;

-- Saves the draw of every open category: [{category_id, groups: [{key, name, entry_ids}], matches: [{key,
-- stage, group, round, position, entry_a, entry_b, source_a, source_b}]}]. Closed or drawn (a new draw replaces
-- the last one); every open category needs 2 pairs with a place.
create function public.save_championship_draw(p_championship_id uuid, p_seed integer, p_draw jsonb)
returns public.championships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_championship public.championships := private.staff_championship(p_championship_id);
  v_item jsonb;
  v_category public.championship_categories;
  v_group jsonb;
  v_match jsonb;
  v_groups jsonb;
  v_matches jsonb;
  v_id uuid;
  v_order integer;
begin
  if v_championship.status not in ('closed', 'drawn') then
    perform private.fail('invalid_state');
  end if;
  if exists (
    select 1 from public.championship_categories c
    where c.championship_id = v_championship.id and c.status = 'open' and private.category_active_count(c.id) < 2
  ) then
    perform private.fail('category_too_small');
  end if;
  if p_seed is null or p_draw is null or jsonb_typeof(p_draw) <> 'array' then
    perform private.fail('invalid_input');
  end if;
  -- Every open category exactly once, and nothing else.
  if jsonb_array_length(p_draw) <> (
       select count(*) from public.championship_categories c
       where c.championship_id = v_championship.id and c.status = 'open'
     )
     or exists (
       select 1 from public.championship_categories c
       where c.championship_id = v_championship.id and c.status = 'open'
         and (select count(*) from jsonb_array_elements(p_draw) as d (item)
              where d.item ->> 'category_id' = c.id::text) <> 1
     ) then
    perform private.fail('invalid_input');
  end if;

  delete from public.championship_matches where championship_id = v_championship.id;
  delete from public.championship_groups where championship_id = v_championship.id;

  for v_item in select d.item from jsonb_array_elements(p_draw) as d (item) loop
    select * into v_category from public.championship_categories
     where id = private.json_uuid(v_item -> 'category_id') and championship_id = v_championship.id;
    v_groups := '{}';
    v_matches := '{}';
    v_order := 0;
    for v_group in select g.item from jsonb_array_elements(coalesce(v_item -> 'groups', '[]')) as g (item) loop
      if coalesce(v_group ->> 'key', '') = '' or jsonb_typeof(v_group -> 'entry_ids') is distinct from 'array' then
        perform private.fail('invalid_input');
      end if;
      insert into public.championship_groups (club_id, championship_id, category_id, name, sort_order)
      values (v_championship.club_id, v_championship.id, v_category.id,
              left(coalesce(nullif(trim(v_group ->> 'name'), ''), 'Zona'), 40), v_order)
      returning id into v_id;
      v_groups := v_groups || jsonb_build_object(v_group ->> 'key', v_id);
      insert into public.championship_group_members (group_id, club_id, entry_id, draw_position)
      select v_id, v_championship.club_id, private.json_uuid(e.item), e.n
      from jsonb_array_elements(v_group -> 'entry_ids') with ordinality as e (item, n);
      v_order := v_order + 1;
    end loop;

    for v_match in select m.item from jsonb_array_elements(coalesce(v_item -> 'matches', '[]')) as m (item) loop
      if coalesce(v_match ->> 'stage', '') not in ('group', 'knockout') or coalesce(v_match ->> 'key', '') = '' then
        perform private.fail('invalid_input');
      end if;
      insert into public.championship_matches (club_id, championship_id, category_id, stage, group_id, round,
                                               bracket_position, entry_a_id, entry_b_id)
      values (v_championship.club_id, v_championship.id, v_category.id,
              (v_match ->> 'stage')::public.championship_stage,
              case when v_match ->> 'stage' = 'group' then private.json_uuid(v_groups -> (v_match ->> 'group')) end,
              (v_match ->> 'round')::smallint, (v_match ->> 'position')::smallint,
              private.json_uuid(v_match -> 'entry_a'), private.json_uuid(v_match -> 'entry_b'))
      returning id into v_id;
      v_matches := v_matches || jsonb_build_object(v_match ->> 'key', v_id);
    end loop;
    -- Sources point at matches of the same draw: set once every key has its id.
    for v_match in select m.item from jsonb_array_elements(coalesce(v_item -> 'matches', '[]')) as m (item) loop
      update public.championship_matches
         set source_a = private.draw_source(v_match -> 'source_a', v_groups, v_matches),
             source_b = private.draw_source(v_match -> 'source_b', v_groups, v_matches)
       where id = (v_matches ->> (v_match ->> 'key'))::uuid;
    end loop;

    if private.draw_problem(v_category) then
      perform private.fail('invalid_input');
    end if;
  end loop;

  update public.championships set status = 'drawn', draw_seed = p_seed
   where id = v_championship.id
  returning * into v_championship;
  return v_championship;
end;
$$;

revoke all on function private.json_uuid(jsonb) from public;
revoke all on function private.draw_source(jsonb, jsonb, jsonb) from public;
revoke all on function private.draw_problem(public.championship_categories) from public;
revoke execute on function public.set_championship_seeds(uuid, uuid[]) from public, anon;
revoke execute on function public.save_championship_draw(uuid, integer, jsonb) from public, anon;
grant execute on function public.set_championship_seeds(uuid, uuid[]) to authenticated;
grant execute on function public.save_championship_draw(uuid, integer, jsonb) to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/championship_draw.test.sql
npm run db:types
```
Expected: PASS (21 tests); los tipos suman `set_championship_seeds` y `save_championship_draw`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261007000130_championship_draw.sql supabase/tests/database/championship_draw.test.sql lib/supabase/database.types.ts
git commit -m "feat(db): seeds and the championship draw, checked and saved"
```

---

### Task 5: Programación

**Files:**
- Create: `supabase/tests/database/championship_schedule.test.sql`
- Create: `supabase/migrations/20261007000140_championship_schedule.sql`
- Modify: `lib/supabase/database.types.ts` (generado)

- [ ] **Step 1: Write the failing test** (con la herramienta Write)

`supabase/tests/database/championship_schedule.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(19);

-- C1 was drawn. 'Libre' (90 minutes): Ana and Pedro (E1), Bruno and Lucía (E2), Gabi and Marta (E3) and Hugo and
-- Nico (E4) in Zona A, with its six matches (M1 E1-E2, M2 E3-E4, M3 E1-E3, M4 E2-E4, M5 E1-E4, M6 E2-E3) and the
-- final F between its 1st and its 2nd. '5ta': Ana again, with Raúl (E5), against Iván and Olga (E6) in M7. Day 10,
-- 08:00 to 23:00, both courts. Bruno and Lucía cannot play the first block of the day.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001', 'drawn');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000001', 10, '08:00', '23:00');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000001',
  '5ta');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a2', 'c4a00000-0000-0000-0000-000000000f03');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a3', 'c4a00000-0000-0000-0000-000000000f04');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000005', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f06');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000006', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a4', 'c4a00000-0000-0000-0000-000000000f05');
call test_helpers.make_group('c5a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'Zona A', array['c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
                  'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004']::uuid[]);
call test_helpers.make_group('c5a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000002',
  'Zona A', array['c3a00000-0000-0000-0000-000000000005', 'c3a00000-0000-0000-0000-000000000006']::uuid[]);
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
  p_group_id => 'c5a00000-0000-0000-0000-000000000001');
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004',
  p_group_id => 'c5a00000-0000-0000-0000-000000000001');
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000003',
  p_group_id => 'c5a00000-0000-0000-0000-000000000001');
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000002', 'c3a00000-0000-0000-0000-000000000004',
  p_group_id => 'c5a00000-0000-0000-0000-000000000001');
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000005', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000004',
  p_group_id => 'c5a00000-0000-0000-0000-000000000001');
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000006', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000002', 'c3a00000-0000-0000-0000-000000000003',
  p_group_id => 'c5a00000-0000-0000-0000-000000000001');
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000007', 'c2a00000-0000-0000-0000-000000000002',
  'c3a00000-0000-0000-0000-000000000005', 'c3a00000-0000-0000-0000-000000000006',
  p_group_id => 'c5a00000-0000-0000-0000-000000000002');
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000008', 'c2a00000-0000-0000-0000-000000000001',
  null, null, p_round => 1, p_position => 1,
  p_source_a => jsonb_build_object('group', 'c5a00000-0000-0000-0000-000000000001', 'place', 1),
  p_source_b => jsonb_build_object('group', 'c5a00000-0000-0000-0000-000000000001', 'place', 2));
insert into public.entry_unavailability (club_id, entry_id, on_date, from_time, to_time)
select 'a0000000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002', b.on_date, b.from_time,
       b.to_time
from private.championship_blocks('c1a00000-0000-0000-0000-000000000001') as b
order by b.block_key
limit 1;

-- A match on court 1 or 2 at a time of day 10 (or of another day), as save_championship_schedule takes it.
create function test_helpers.slot_of(p_match_id uuid, p_court integer, p_time time, p_days integer default 10)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object('match_id', p_match_id,
    'court_id', ('c0000000-0000-0000-0000-00000000000' || p_court)::uuid,
    'starts_at', test_helpers.at(p_days, p_time));
$$;

-- A schedule that keeps every rule: 08:00 M2 and M7, 11:00 M3 and M4, 14:00 M5 and M6, 17:00 M1, 20:00 the final.
create function test_helpers.good_schedule()
returns jsonb
language sql
stable
as $$
  select jsonb_build_array(
    test_helpers.slot_of('c6a00000-0000-0000-0000-000000000002', 1, '08:00'),
    test_helpers.slot_of('c6a00000-0000-0000-0000-000000000007', 2, '08:00'),
    test_helpers.slot_of('c6a00000-0000-0000-0000-000000000003', 1, '11:00'),
    test_helpers.slot_of('c6a00000-0000-0000-0000-000000000004', 2, '11:00'),
    test_helpers.slot_of('c6a00000-0000-0000-0000-000000000005', 1, '14:00'),
    test_helpers.slot_of('c6a00000-0000-0000-0000-000000000006', 2, '14:00'),
    test_helpers.slot_of('c6a00000-0000-0000-0000-000000000001', 1, '17:00'),
    test_helpers.slot_of('c6a00000-0000-0000-0000-000000000008', 1, '20:00'));
$$;

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select throws_ok(
  format('select public.save_championship_schedule(%L, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(test_helpers.slot_of('c6a00000-0000-0000-0000-000000000001', 1, '08:00'))),
  'P0001', 'unavailable_pair', 'no match when a pair said it cannot play');
select throws_ok(
  format('select public.save_championship_schedule(%L, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(test_helpers.slot_of('c6a00000-0000-0000-0000-000000000003', 1, '11:00'),
                           test_helpers.slot_of('c6a00000-0000-0000-0000-000000000005', 2, '11:00'))),
  'P0001', 'pair_busy', 'a pair never plays two matches at once');
select throws_ok(
  format('select public.save_championship_schedule(%L, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(test_helpers.slot_of('c6a00000-0000-0000-0000-000000000003', 1, '11:00'),
                           test_helpers.slot_of('c6a00000-0000-0000-0000-000000000005', 1, '12:30'))),
  'P0001', 'pair_busy', 'and rests 45 minutes between matches');
select throws_ok(
  format('select public.save_championship_schedule(%L, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(test_helpers.slot_of('c6a00000-0000-0000-0000-000000000003', 1, '11:00'),
                           test_helpers.slot_of('c6a00000-0000-0000-0000-000000000007', 2, '11:00'))),
  'P0001', 'pair_busy', 'a player of two categories is never in two places at once');
select throws_ok(
  format('select public.save_championship_schedule(%L, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(test_helpers.slot_of('c6a00000-0000-0000-0000-000000000002', 1, '08:00'),
                           test_helpers.slot_of('c6a00000-0000-0000-0000-000000000007', 1, '08:00'))),
  'P0001', 'courts_busy', 'one court, one match');
select throws_ok(
  format('select public.save_championship_schedule(%L, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_build_array(test_helpers.slot_of('c6a00000-0000-0000-0000-000000000002', 1, '08:00', 11))),
  'P0001', 'outside_play_days', 'every match inside a day of play');
select throws_ok(
  format('select public.save_championship_schedule(%L, %L)', 'c1a00000-0000-0000-0000-000000000001',
         jsonb_set(test_helpers.good_schedule(), '{7}',
                   test_helpers.slot_of('c6a00000-0000-0000-0000-000000000008', 2, '17:00'))),
  'P0001', 'too_early', 'the final starts after the group ends, plus the rest');
select lives_ok(
  format('select public.save_championship_schedule(%L, %L)', 'c1a00000-0000-0000-0000-000000000001',
         test_helpers.good_schedule()),
  'a schedule that keeps every rule is saved');
select is((select count(*)::int from public.championship_matches
           where championship_id = 'c1a00000-0000-0000-0000-000000000001' and court_id is not null), 8,
  'every match has a court and a start');
select is((select ends_at - starts_at from public.championship_matches
           where id = 'c6a00000-0000-0000-0000-000000000001'), interval '90 minutes',
  'and lasts the minutes of its category');
select lives_ok(
  $$ select public.set_match_pinned('c6a00000-0000-0000-0000-000000000007', true) $$,
  'the organizer pins a match');
select lives_ok(
  $$ select public.save_championship_schedule('c1a00000-0000-0000-0000-000000000001', '[]') $$,
  'scheduling again places the rest from scratch');
select ok(
  (select court_id is not null from public.championship_matches where id = 'c6a00000-0000-0000-0000-000000000007')
  and (select court_id is null from public.championship_matches where id = 'c6a00000-0000-0000-0000-000000000001'),
  'and leaves the pinned one where it was');
select lives_ok(
  format('select public.set_match_slot(%L, %L, %L)', 'c6a00000-0000-0000-0000-000000000001',
         'c0000000-0000-0000-0000-000000000001', test_helpers.at(10, '17:00')),
  'the organizer moves a match by hand');
select ok((select pinned from public.championship_matches where id = 'c6a00000-0000-0000-0000-000000000001'),
  'a match moved by hand stays put');
select throws_ok(
  format('select public.set_match_slot(%L, %L, %L)', 'c6a00000-0000-0000-0000-000000000002',
         'c0000000-0000-0000-0000-000000000002', test_helpers.at(10, '08:00')),
  'P0001', 'courts_busy', 'not onto a court that is taken');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok(
  format('select public.set_match_slot(%L, %L, %L)', 'c6a00000-0000-0000-0000-000000000002',
         'c0000000-0000-0000-0000-000000000001', test_helpers.at(10, '08:00')),
  'P0001', 'forbidden', 'staff of another club cannot move a match');

-- Ana, a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.save_championship_schedule('c1a00000-0000-0000-0000-000000000001', '[]') $$,
  'P0001', 'forbidden', 'nor can a member schedule');

-- M2 is being played.
reset role;
update public.championship_matches set status = 'playing' where id = 'c6a00000-0000-0000-0000-000000000002';
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok(
  format('select public.set_match_slot(%L, %L, %L)', 'c6a00000-0000-0000-0000-000000000002',
         'c0000000-0000-0000-0000-000000000001', test_helpers.at(10, '11:00')),
  'P0001', 'invalid_state', 'a match being played does not move');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/championship_schedule.test.sql`
Expected: FAIL — `function public.save_championship_schedule(unknown, unknown) does not exist`.

- [ ] **Step 3: Write minimal implementation**

`supabase/migrations/20261007000140_championship_schedule.sql`:
```sql
-- Campeonatos, día del torneo, part 3: the schedule. lib/domain/championship-schedule.ts places every match;
-- save_championship_schedule saves it and private.schedule_problem checks the hard rules again. The organizer
-- moves a match by hand (set_match_slot, which also pins it) and pins or unpins matches before publishing.

-- The first hard rule the schedule breaks, as an error code, or null. With p_match_id, only the problems that
-- involve that match (moving one match never fails because of another one).
create function private.schedule_problem(p_championship_id uuid, p_match_id uuid default null)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_timezone text;
begin
  select c.timezone into v_timezone
  from public.championships ch join public.clubs c on c.id = ch.club_id
  where ch.id = p_championship_id;

  -- Inside a day of play and on one of its courts, on the category's steps from the start of that day, as long
  -- as the category's matches.
  if exists (
    select 1 from public.championship_matches m
    join public.championship_categories c on c.id = m.category_id
    where m.championship_id = p_championship_id and m.court_id is not null
      and (p_match_id is null or m.id = p_match_id)
      and (m.ends_at - m.starts_at <> make_interval(mins => c.match_minutes)
           or not exists (
             select 1 from public.championship_windows w
             cross join lateral (select private.window_period(w, v_timezone) as period) as p
             where w.championship_id = p_championship_id and m.court_id = any (w.court_ids)
               and p.period @> tstzrange(m.starts_at, m.ends_at)
               and (extract(epoch from m.starts_at - lower(p.period))::integer / 60) % c.match_minutes = 0))
  ) then
    return 'outside_play_days';
  end if;

  -- One court, one match (the deferred exclusion constraint has the last word).
  if exists (
    select 1 from public.championship_matches a
    join public.championship_matches b
      on b.court_id = a.court_id and b.id <> a.id
     and tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at)
    where a.championship_id = p_championship_id and a.court_id is not null
      and (p_match_id is null or a.id = p_match_id)
  ) then
    return 'courts_busy';
  end if;

  -- A knockout match starts 45 minutes after the matches that define it end (for a group's place, all of them).
  if exists (
    select 1 from public.championship_matches m
    cross join lateral (values (m.source_a), (m.source_b)) as s (source)
    join public.championship_matches f
      on f.id = (s.source ->> 'winner_of')::uuid or f.group_id = (s.source ->> 'group')::uuid
    where m.championship_id = p_championship_id and m.starts_at is not null
      and (p_match_id is null or m.id = p_match_id or f.id = p_match_id)
      and (f.ends_at is null or m.starts_at < f.ends_at + interval '45 minutes')
  ) then
    return 'too_early';
  end if;

  -- A pair rests 45 minutes between matches; a player in two categories is never in two places at once.
  if exists (
    with plays as (
      select m.id, m.starts_at, m.ends_at, s.entry_id
      from public.championship_matches m
      cross join lateral (values (m.entry_a_id), (m.entry_b_id)) as s (entry_id)
      where m.championship_id = p_championship_id and m.starts_at is not null and s.entry_id is not null
    )
    select 1 from plays a join plays b on b.entry_id = a.entry_id and b.id <> a.id
    where (p_match_id is null or a.id = p_match_id)
      and a.starts_at < b.ends_at + interval '45 minutes' and b.starts_at < a.ends_at + interval '45 minutes'
  ) or exists (
    with plays as (
      select m.id, m.starts_at, m.ends_at, p.player_id
      from public.championship_matches m
      join public.championship_entries e on e.id in (m.entry_a_id, m.entry_b_id)
      cross join lateral (values (e.player1_id), (e.player2_id)) as p (player_id)
      where m.championship_id = p_championship_id and m.starts_at is not null
    )
    select 1 from plays a join plays b on b.player_id = a.player_id and b.id <> a.id
    where (p_match_id is null or a.id = p_match_id)
      and a.starts_at < b.ends_at and b.starts_at < a.ends_at
  ) then
    return 'pair_busy';
  end if;

  -- Never when a pair said it cannot play (its "horarios imposibles").
  if exists (
    select 1 from public.championship_matches m
    join public.entry_unavailability u on u.entry_id in (m.entry_a_id, m.entry_b_id)
    where m.championship_id = p_championship_id and m.starts_at is not null
      and (p_match_id is null or m.id = p_match_id)
      and tstzrange(m.starts_at, m.ends_at)
          && tstzrange((u.on_date + u.from_time) at time zone v_timezone,
                       (u.on_date + u.to_time) at time zone v_timezone)
  ) then
    return 'unavailable_pair';
  end if;
  return null;
end;
$$;

-- Saves where every match goes ([{match_id, court_id, starts_at}], no court for one left out). Pinned matches
-- stay where they are; every other match not listed is left without a court. Only before publishing.
create function public.save_championship_schedule(p_championship_id uuid, p_slots jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_championship public.championships := private.staff_championship(p_championship_id);
  v_slot jsonb;
  v_match public.championship_matches;
  v_minutes integer;
  v_starts timestamptz;
  v_problem text;
begin
  if v_championship.status <> 'drawn' then
    perform private.fail('invalid_state');
  end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    perform private.fail('invalid_input');
  end if;

  update public.championship_matches set court_id = null, starts_at = null, ends_at = null
   where championship_id = v_championship.id and not pinned;
  for v_slot in select s.item from jsonb_array_elements(p_slots) as s (item) loop
    select * into v_match from public.championship_matches
     where id = private.json_uuid(v_slot -> 'match_id') and championship_id = v_championship.id;
    if not found then
      perform private.fail('not_found');
    end if;
    if v_match.pinned or v_slot -> 'court_id' is null or jsonb_typeof(v_slot -> 'court_id') = 'null' then
      continue;
    end if;
    if jsonb_typeof(v_slot -> 'starts_at') is distinct from 'string' then
      perform private.fail('invalid_input');
    end if;
    v_starts := (v_slot ->> 'starts_at')::timestamptz;
    select match_minutes into v_minutes from public.championship_categories where id = v_match.category_id;
    update public.championship_matches
       set court_id = private.json_uuid(v_slot -> 'court_id'), starts_at = v_starts,
           ends_at = v_starts + make_interval(mins => v_minutes)
     where id = v_match.id;
  end loop;

  v_problem := private.schedule_problem(v_championship.id);
  if v_problem is not null then
    perform private.fail(v_problem);
  end if;
  return (select count(*)::integer from public.championship_matches
          where championship_id = v_championship.id and court_id is not null);
end;
$$;

-- "Editar": another court and start for a match not played yet, from the drawn fixture to the day of the
-- tournament. It also pins the match.
create function public.set_match_slot(p_match_id uuid, p_court_id uuid, p_starts_at timestamptz)
returns public.championship_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.championship_matches;
  v_championship public.championships;
  v_minutes integer;
  v_problem text;
begin
  select * into v_match from public.championship_matches where id = p_match_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_championship := private.staff_championship(v_match.championship_id);
  if v_championship.status not in ('drawn', 'published', 'in_progress') then
    perform private.fail('invalid_state');
  end if;
  -- Read again under the championship's lock.
  select * into v_match from public.championship_matches where id = p_match_id;
  if v_match.status <> 'scheduled' then
    perform private.fail('invalid_state');
  end if;
  if p_court_id is null or p_starts_at is null then
    perform private.fail('invalid_input');
  end if;

  select match_minutes into v_minutes from public.championship_categories where id = v_match.category_id;
  update public.championship_matches
     set court_id = p_court_id, starts_at = p_starts_at, ends_at = p_starts_at + make_interval(mins => v_minutes),
         pinned = true
   where id = v_match.id
  returning * into v_match;
  v_problem := private.schedule_problem(v_championship.id, v_match.id);
  if v_problem is not null then
    perform private.fail(v_problem);
  end if;
  return v_match;
end;
$$;

-- "Fijar" / "Soltar", before publishing: "Volver a programar" leaves a pinned match where it is.
create function public.set_match_pinned(p_match_id uuid, p_pinned boolean)
returns public.championship_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.championship_matches;
  v_championship public.championships;
begin
  select * into v_match from public.championship_matches where id = p_match_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_championship := private.staff_championship(v_match.championship_id);
  if v_championship.status <> 'drawn' then
    perform private.fail('invalid_state');
  end if;
  select * into v_match from public.championship_matches where id = p_match_id;
  if p_pinned is null or (p_pinned and v_match.court_id is null) then
    perform private.fail('invalid_state');
  end if;
  update public.championship_matches set pinned = p_pinned where id = v_match.id returning * into v_match;
  return v_match;
end;
$$;

revoke all on function private.schedule_problem(uuid, uuid) from public;
revoke execute on function public.save_championship_schedule(uuid, jsonb) from public, anon;
revoke execute on function public.set_match_slot(uuid, uuid, timestamptz) from public, anon;
revoke execute on function public.set_match_pinned(uuid, boolean) from public, anon;
grant execute on function public.save_championship_schedule(uuid, jsonb) to authenticated;
grant execute on function public.set_match_slot(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.set_match_pinned(uuid, boolean) to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/championship_schedule.test.sql
npm run db:types
```
Expected: PASS (19 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261007000140_championship_schedule.sql supabase/tests/database/championship_schedule.test.sql lib/supabase/database.types.ts
git commit -m "feat(db): save and adjust the championship schedule, hard rules checked"
```

---

### Task 6: Publicar el fixture

**Files:**
- Create: `supabase/tests/database/championship_publish.test.sql`
- Create: `supabase/migrations/20261007000150_championship_publish.sql`
- Modify: `lib/supabase/database.types.ts` (generado)

- [ ] **Step 1: Write the failing test** (con la herramienta Write)

`supabase/tests/database/championship_publish.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(13);

-- C1 was drawn and scheduled: 'Libre', Ana and Pedro against Bruno and Lucía on day 10 at 08:00, court 1. Its
-- day of play (08:00 to 14:00, court 1) holds the court since registration opened.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001', 'drawn');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000001', 10, '08:00', '14:00',
  array['c0000000-0000-0000-0000-000000000001']::uuid[]);
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02');
call test_helpers.make_group('c5a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'Zona A', array['c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002']::uuid[]);
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
  p_group_id => 'c5a00000-0000-0000-0000-000000000001', p_court => 'c0000000-0000-0000-0000-000000000001',
  p_starts => test_helpers.at(10, '08:00'));
insert into public.court_occupancy (club_id, court_id, kind, period, note, championship_id) values
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'championship',
   test_helpers.slot(10, '08:00', 360), 'Campeonato T', 'c1a00000-0000-0000-0000-000000000001');
-- C2 was drawn but its match has no court yet (Gabi and Marta against Hugo and Nico).
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000002', 'drawn');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000002');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a2', 'c4a00000-0000-0000-0000-000000000f03');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a3', 'c4a00000-0000-0000-0000-000000000f04');
call test_helpers.make_group('c5a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000002',
  'Zona A', array['c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004']::uuid[]);
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000002',
  'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004',
  p_group_id => 'c5a00000-0000-0000-0000-000000000002');
-- C3 like C1, on day 11 on court 2 (Iván and Olga against Juli and Raúl).
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000003', 'drawn');
call test_helpers.make_window('c1a00000-0000-0000-0000-000000000003', 11, '08:00', '14:00',
  array['c0000000-0000-0000-0000-000000000002']::uuid[]);
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000003', 'c1a00000-0000-0000-0000-000000000003');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000005', 'c2a00000-0000-0000-0000-000000000003',
  'c4a00000-0000-0000-0000-0000000000a4', 'c4a00000-0000-0000-0000-000000000f05');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000006', 'c2a00000-0000-0000-0000-000000000003',
  'c4a00000-0000-0000-0000-0000000000a5', 'c4a00000-0000-0000-0000-000000000f06');
call test_helpers.make_group('c5a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000003',
  'Zona A', array['c3a00000-0000-0000-0000-000000000005', 'c3a00000-0000-0000-0000-000000000006']::uuid[]);
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000003',
  'c3a00000-0000-0000-0000-000000000005', 'c3a00000-0000-0000-0000-000000000006',
  p_group_id => 'c5a00000-0000-0000-0000-000000000003', p_court => 'c0000000-0000-0000-0000-000000000002',
  p_starts => test_helpers.at(11, '08:00'));
insert into public.court_occupancy (club_id, court_id, kind, period, note, championship_id) values
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'championship',
   test_helpers.slot(11, '08:00', 360), 'Campeonato T', 'c1a00000-0000-0000-0000-000000000003');

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select throws_ok(
  $$ select public.publish_championship('c1a00000-0000-0000-0000-000000000002') $$,
  'P0001', 'schedule_incomplete', 'every match needs a court and a start before publishing');
select lives_ok(
  $$ select public.publish_championship('c1a00000-0000-0000-0000-000000000001', true) $$,
  'the organizer publishes the fixture, giving back what the matches do not use');
select is((select status::text from public.championships where id = 'c1a00000-0000-0000-0000-000000000001'),
  'published', 'the championship is published');
select ok((select public_code ~ '^campeonato-t-[0-9a-f]{4}$' from public.championships
           where id = 'c1a00000-0000-0000-0000-000000000001'),
  'with a short public code made from its name');
select is(test_helpers.notices('00000000-0000-0000-0000-0000000000a1', 'championship_fixture'), 1,
  'each member of a pair hears the fixture is out');
select is(test_helpers.notices('00000000-0000-0000-0000-0000000000b1', 'championship_fixture'), 1,
  'both pairs');
select is(test_helpers.last_notice('00000000-0000-0000-0000-0000000000a1', 'championship_fixture')
            ->> 'category_name', 'Libre', 'about her category');
select is((select count(*)::int from public.court_occupancy
           where championship_id = 'c1a00000-0000-0000-0000-000000000001'), 1,
  'only the slot with a match keeps the court');
select is((select period from public.court_occupancy
           where championship_id = 'c1a00000-0000-0000-0000-000000000001'),
  test_helpers.slot(10, '08:00', 90), 'the club slot of that match');
select throws_ok(
  $$ select public.publish_championship('c1a00000-0000-0000-0000-000000000001') $$,
  'P0001', 'invalid_state', 'a fixture is published once');
select lives_ok(
  $$ select public.publish_championship('c1a00000-0000-0000-0000-000000000003') $$,
  'publishing keeps the courts unless told otherwise');
select is((select period from public.court_occupancy
           where championship_id = 'c1a00000-0000-0000-0000-000000000003'),
  test_helpers.slot(11, '08:00', 360), 'the whole day of play stays blocked');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok(
  $$ select public.publish_championship('c1a00000-0000-0000-0000-000000000002') $$,
  'P0001', 'forbidden', 'staff of another club cannot publish');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/championship_publish.test.sql`
Expected: FAIL — `function public.publish_championship(unknown) does not exist`.

- [ ] **Step 3: Write minimal implementation**

`supabase/migrations/20261007000150_championship_publish.sql`:
```sql
-- Campeonatos, día del torneo, part 4: publishing. Every match has a court and a start and the hard rules hold;
-- the championship gets its public link, each pair hears the fixture is out, and the organizer may give back to
-- the grid what the matches do not use.

-- A short, readable code for the public link: the name in lower case without accents (up to 24 characters), a
-- dash and 4 random ones ("campeonato-de-primavera-7k2f").
create function private.championship_code(p_name text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_base text;
  v_code text;
begin
  v_base := regexp_replace(translate(lower(p_name), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '-', 'g');
  v_base := trim(both '-' from left(trim(both '-' from v_base), 24));
  if v_base = '' then
    v_base := 'campeonato';
  end if;
  loop
    v_code := v_base || '-' || substr(md5(gen_random_uuid()::text), 1, 4);
    exit when not exists (select 1 from public.championships where public_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- Each occupancy of the championship becomes the club's grid slots of that court that have a match. The
-- waitlist (court_occupancy_offer_freed) offers the rest when the transaction commits. Returns the slots kept.
create function private.release_free_windows(p_championship_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_occupancy public.court_occupancy;
  v_timezone text;
  v_slot tstzrange;
  v_kept integer := 0;
begin
  select c.timezone into v_timezone
  from public.championships ch join public.clubs c on c.id = ch.club_id
  where ch.id = p_championship_id;
  for v_occupancy in
    select * from public.court_occupancy where championship_id = p_championship_id order by period
  loop
    delete from public.court_occupancy where id = v_occupancy.id;
    for v_slot in
      select s.period
      from generate_series((lower(v_occupancy.period) at time zone v_timezone)::date,
                           (upper(v_occupancy.period) at time zone v_timezone)::date, interval '1 day') as d (day)
      cross join lateral private.day_slots(v_occupancy.club_id, d.day::date) as s (period)
      where s.period && v_occupancy.period
      order by s.period
    loop
      if exists (
        select 1 from public.championship_matches m
        where m.championship_id = p_championship_id and m.court_id = v_occupancy.court_id
          and tstzrange(m.starts_at, m.ends_at) && v_slot
      ) then
        insert into public.court_occupancy (club_id, court_id, kind, period, note, championship_id, created_by)
        values (v_occupancy.club_id, v_occupancy.court_id, 'championship', v_slot * v_occupancy.period,
                v_occupancy.note, p_championship_id, v_occupancy.created_by);
        v_kept := v_kept + 1;
      end if;
    end loop;
  end loop;
  return v_kept;
end;
$$;

-- "Publicar": drawn, every match placed and the hard rules kept. The fixture becomes visible to members and on
-- the public page; each member of a pair with a place gets the aviso 'championship_fixture'.
create function public.publish_championship(p_championship_id uuid, p_release_free boolean default false)
returns public.championships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_championship public.championships := private.staff_championship(p_championship_id);
  v_problem text;
  v_entry public.championship_entries;
begin
  if v_championship.status <> 'drawn' then
    perform private.fail('invalid_state');
  end if;
  if not exists (select 1 from public.championship_matches where championship_id = v_championship.id)
     or exists (select 1 from public.championship_matches
                where championship_id = v_championship.id and court_id is null) then
    perform private.fail('schedule_incomplete');
  end if;
  v_problem := private.schedule_problem(v_championship.id);
  if v_problem is not null then
    perform private.fail(v_problem);
  end if;
  if coalesce(p_release_free, false) then
    perform private.release_free_windows(v_championship.id);
  end if;

  update public.championships
     set status = 'published', public_code = coalesce(public_code, private.championship_code(name))
   where id = v_championship.id
  returning * into v_championship;
  for v_entry in
    select e.* from public.championship_entries e
    join public.championship_categories c on c.id = e.category_id
    where c.championship_id = v_championship.id and c.status = 'open' and e.status = 'active'
    order by c.sort_order, e.created_at, e.id
  loop
    perform private.notify_championship_entry(v_entry, 'championship_fixture', null);
  end loop;
  return v_championship;
end;
$$;

revoke all on function private.championship_code(text) from public;
revoke all on function private.release_free_windows(uuid) from public;
revoke execute on function public.publish_championship(uuid, boolean) from public, anon;
grant execute on function public.publish_championship(uuid, boolean) to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/championship_publish.test.sql
npm run db:types
```
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261007000150_championship_publish.sql supabase/tests/database/championship_publish.test.sql lib/supabase/database.types.ts
git commit -m "feat(db): publish the fixture with its public code and avisos"
```

---

### Task 7: Resultados, zonas y final

**Files:**
- Create: `supabase/tests/database/championship_results.test.sql`
- Create: `supabase/migrations/20261007000160_championship_results.sql`
- Modify: `lib/supabase/database.types.ts` (generado)

- [ ] **Step 1: Write the failing test** (con la herramienta Write)

`supabase/tests/database/championship_results.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(35);

-- C1 is published. 'Libre' (third set a super tie-break, no time limit): Ana and Pedro (E1), Bruno and Lucía
-- (E2), Gabi and Marta (E3) and Hugo and Nico (E4) in Zona A, its six matches (M1 E1-E2, M2 E3-E4, M3 E1-E3,
-- M4 E2-E4, M5 E1-E4, M6 E2-E3) and the final F between its 1st and its 2nd. 'Corto' (50 minutes of play): Iván
-- and Olga (E5) against Juli and Raúl (E6) in M7. 'Llave': Bruno and Olga (E7) against Gabi and Raúl (E8) in
-- the semifinal S1, whose winner meets Iván and Pedro (E9) in the final F3.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001', 'published');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000001',
  'Corto');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000003', 'c1a00000-0000-0000-0000-000000000001',
  'Llave');
update public.championship_categories set match_rules = match_rules || '{"time_limit_minutes": 50}'
 where id = 'c2a00000-0000-0000-0000-000000000002';
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a2', 'c4a00000-0000-0000-0000-000000000f03');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a3', 'c4a00000-0000-0000-0000-000000000f04');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000005', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a4', 'c4a00000-0000-0000-0000-000000000f05');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000006', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a5', 'c4a00000-0000-0000-0000-000000000f06');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000007', 'c2a00000-0000-0000-0000-000000000003',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f05');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000008', 'c2a00000-0000-0000-0000-000000000003',
  'c4a00000-0000-0000-0000-0000000000a2', 'c4a00000-0000-0000-0000-000000000f06');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000009', 'c2a00000-0000-0000-0000-000000000003',
  'c4a00000-0000-0000-0000-0000000000a4', 'c4a00000-0000-0000-0000-000000000f01');
call test_helpers.make_group('c5a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'Zona A', array['c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
                  'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004']::uuid[]);
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
  p_group_id => 'c5a00000-0000-0000-0000-000000000001');
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004',
  p_group_id => 'c5a00000-0000-0000-0000-000000000001');
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000003',
  p_group_id => 'c5a00000-0000-0000-0000-000000000001');
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000002', 'c3a00000-0000-0000-0000-000000000004',
  p_group_id => 'c5a00000-0000-0000-0000-000000000001');
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000005', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000004',
  p_group_id => 'c5a00000-0000-0000-0000-000000000001');
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000006', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000002', 'c3a00000-0000-0000-0000-000000000003',
  p_group_id => 'c5a00000-0000-0000-0000-000000000001');
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000008', 'c2a00000-0000-0000-0000-000000000001',
  null, null, p_round => 1, p_position => 1,
  p_source_a => jsonb_build_object('group', 'c5a00000-0000-0000-0000-000000000001', 'place', 1),
  p_source_b => jsonb_build_object('group', 'c5a00000-0000-0000-0000-000000000001', 'place', 2));
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000007', 'c2a00000-0000-0000-0000-000000000002',
  'c3a00000-0000-0000-0000-000000000005', 'c3a00000-0000-0000-0000-000000000006', p_round => 1, p_position => 1);
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000009', 'c2a00000-0000-0000-0000-000000000003',
  'c3a00000-0000-0000-0000-000000000007', 'c3a00000-0000-0000-0000-000000000008', p_round => 2, p_position => 1);
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-00000000000a', 'c2a00000-0000-0000-0000-000000000003',
  null, 'c3a00000-0000-0000-0000-000000000009', p_round => 1, p_position => 1,
  p_source_a => jsonb_build_object('winner_of', 'c6a00000-0000-0000-0000-000000000009'));

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select throws_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000001', '[[6,5],[6,4]]') $$,
  'P0001', 'invalid_result', '6-5 is not a set: at 6-6 there is a tie-break');
select throws_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000001', '[[6,4],[3,6],[10,9]]') $$,
  'P0001', 'invalid_result', 'a super tie-break is won by 2');
select throws_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000001', '[[6,4],[3,6]]') $$,
  'P0001', 'invalid_result', 'without a time limit somebody wins 2 sets');
select throws_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000001', '[[6,4],[6,3],[6,2]]') $$,
  'P0001', 'invalid_result', 'no set after the match is won');
select lives_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000001', '[[6,4],[3,6],[10,8]]') $$,
  'reception records a result decided in the super tie-break');
select results_eq(
  $$ select status::text, winner_entry_id from public.championship_matches
     where id = 'c6a00000-0000-0000-0000-000000000001' $$,
  $$ values ('finished', 'c3a00000-0000-0000-0000-000000000001'::uuid) $$,
  'the match is finished with its winner');
select results_eq(
  $$ select set_number::int, games_a::int, games_b::int, super_tiebreak from public.championship_match_sets
     where match_id = 'c6a00000-0000-0000-0000-000000000001' order by set_number $$,
  $$ values (1, 6, 4, false), (2, 3, 6, false), (3, 10, 8, true) $$,
  'and its sets');
select is((select status::text from public.championships where id = 'c1a00000-0000-0000-0000-000000000001'),
  'in_progress', 'the first result starts the championship');
select lives_ok(
  $$ select public.record_walkover('c6a00000-0000-0000-0000-000000000007', 'c3a00000-0000-0000-0000-000000000006') $$,
  'a pair that did not show up loses by W.O.');
select results_eq(
  $$ select status::text, winner_entry_id, walkover_entry_id,
            (select count(*)::int from public.championship_match_sets where match_id = m.id)
     from public.championship_matches m where id = 'c6a00000-0000-0000-0000-000000000007' $$,
  $$ values ('walkover', 'c3a00000-0000-0000-0000-000000000005'::uuid, 'c3a00000-0000-0000-0000-000000000006'::uuid, 2) $$,
  'counted 6-0 6-0');
select lives_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000007', '[[6,4],[3,3]]') $$,
  'with a time limit the last set may stay as it was');
select throws_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000007', '[[4,4]]') $$,
  'P0001', 'invalid_result', 'but a draw is no result');
select lives_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000009', '[[6,1],[6,2]]') $$,
  'reception records a semifinal');
select is((select entry_a_id from public.championship_matches where id = 'c6a00000-0000-0000-0000-00000000000a'),
  'c3a00000-0000-0000-0000-000000000007'::uuid, 'its winner goes on to the final');
select lives_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000009', '[[1,6],[2,6]]') $$,
  'a result is corrected while the next match has not started');
select is((select entry_a_id from public.championship_matches where id = 'c6a00000-0000-0000-0000-00000000000a'),
  'c3a00000-0000-0000-0000-000000000008'::uuid, 'and the new winner takes the place');
select lives_ok(
  $$ select public.start_match('c6a00000-0000-0000-0000-00000000000a') $$,
  'the final is being played');
select throws_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000009', '[[6,1],[6,2]]') $$,
  'P0001', 'invalid_state', 'no correction once the next match started');
select throws_ok(
  $$ select public.start_match('c6a00000-0000-0000-0000-000000000008') $$,
  'P0001', 'invalid_state', 'a match does not start before its pairs are known');

-- M2 to M5 are played (Gabi and Marta, Ana and Pedro, Bruno and Lucía, Ana and Pedro win).
reset role;
call test_helpers.finish_cmatch('c6a00000-0000-0000-0000-000000000002', 'c3a00000-0000-0000-0000-000000000003');
call test_helpers.finish_cmatch('c6a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000001');
call test_helpers.finish_cmatch('c6a00000-0000-0000-0000-000000000004', 'c3a00000-0000-0000-0000-000000000002');
call test_helpers.finish_cmatch('c6a00000-0000-0000-0000-000000000005', 'c3a00000-0000-0000-0000-000000000001');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok(
  $$ select public.close_championship_group('c5a00000-0000-0000-0000-000000000001',
       array['c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
             'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004']::uuid[]) $$,
  'P0001', 'scores_missing', 'a group closes when all its matches are played');

-- M6 too (Bruno and Lucía win): Ana and Pedro won 3, Bruno and Lucía 2, Gabi and Marta 1, Hugo and Nico 0.
reset role;
call test_helpers.finish_cmatch('c6a00000-0000-0000-0000-000000000006', 'c3a00000-0000-0000-0000-000000000002');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok(
  $$ select public.close_championship_group('c5a00000-0000-0000-0000-000000000001',
       array['c3a00000-0000-0000-0000-000000000002', 'c3a00000-0000-0000-0000-000000000001',
             'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004']::uuid[]) $$,
  'P0001', 'invalid_input', 'nobody goes above a pair that won more');
select lives_ok(
  $$ select public.close_championship_group('c5a00000-0000-0000-0000-000000000001',
       array['c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
             'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004']::uuid[]) $$,
  'the group closes in the order of its table');
select results_eq(
  $$ select entry_a_id, entry_b_id from public.championship_matches
     where id = 'c6a00000-0000-0000-0000-000000000008' $$,
  $$ values ('c3a00000-0000-0000-0000-000000000001'::uuid, 'c3a00000-0000-0000-0000-000000000002'::uuid) $$,
  'its 1st and its 2nd go to the final');
select results_eq(
  $$ select entry_id, place::int from public.championship_group_members
     where group_id = 'c5a00000-0000-0000-0000-000000000001' order by place $$,
  $$ values ('c3a00000-0000-0000-0000-000000000001'::uuid, 1), ('c3a00000-0000-0000-0000-000000000002'::uuid, 2),
            ('c3a00000-0000-0000-0000-000000000003'::uuid, 3), ('c3a00000-0000-0000-0000-000000000004'::uuid, 4) $$,
  'with every place saved');
select lives_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000006', '[[6,2],[6,2]]') $$,
  'a group result is corrected while its final has not started');
select ok(
  not exists (select 1 from public.championship_group_members
              where group_id = 'c5a00000-0000-0000-0000-000000000001' and place is not null)
  and (select entry_a_id is null and entry_b_id is null from public.championship_matches
       where id = 'c6a00000-0000-0000-0000-000000000008'),
  'which opens the group again and takes its pairs out of the final');
select throws_ok(
  $$ select public.finish_championship('c1a00000-0000-0000-0000-000000000001') $$,
  'P0001', 'scores_missing', 'a championship finishes when everything is played');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000002', '[[6,1],[6,1]]') $$,
  'P0001', 'forbidden', 'staff of another club record nothing');

-- Ana, a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.start_match('c6a00000-0000-0000-0000-000000000002') $$,
  'P0001', 'forbidden', 'players do not record their own matches');

-- Carla, reception, plays it to the end.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok(
  $$ select public.close_championship_group('c5a00000-0000-0000-0000-000000000001',
       array['c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002',
             'c3a00000-0000-0000-0000-000000000003', 'c3a00000-0000-0000-0000-000000000004']::uuid[]) $$,
  'the group closes again');
select lives_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000008', '[[6,3],[6,3]]') $$,
  'the final of Libre is played');
select lives_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-00000000000a', '[[6,3],[6,3]]') $$,
  'and the final of Llave');
select lives_ok(
  $$ select public.finish_championship('c1a00000-0000-0000-0000-000000000001') $$,
  'the organizer finishes the championship');
select is((select status::text from public.championships where id = 'c1a00000-0000-0000-0000-000000000001'),
  'finished', 'it is finished');

reset role;
select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.proname in ('json_uuid', 'draw_source', 'draw_problem', 'schedule_problem', 'championship_code',
                         'release_free_windows', 'set_done', 'set_partial', 'match_winner', 'staff_match',
                         'mark_in_progress', 'next_matches', 'apply_result')
       and has_function_privilege('authenticated', p.oid, 'execute') $$,
  'authenticated cannot execute the fixture helpers');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/championship_results.test.sql`
Expected: FAIL — `function public.record_match_result(unknown, unknown) does not exist`.

- [ ] **Step 3: Write minimal implementation**

`supabase/migrations/20261007000160_championship_results.sql`:
```sql
-- Campeonatos, día del torneo, part 5: the tournament day. Staff start matches and record results (checked
-- against the category's rules, the same as lib/domain/championship-results.ts) or a W.O.; a knockout winner goes
-- on by itself; a closed group sends its places to the bracket; the championship finishes when all is played.

-- A set that ended: 6-0 to 6-4, 7-5 or 7-6 (tie-break at 6-6); a super tie-break to 10 by 2 (11-9, 12-10...).
create function private.set_done(p_a integer, p_b integer, p_super boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_super then greatest(p_a, p_b) >= 10 and abs(p_a - p_b) >= 2
                      and (greatest(p_a, p_b) = 10 or abs(p_a - p_b) = 2)
    else (greatest(p_a, p_b) = 6 and least(p_a, p_b) <= 4)
         or (greatest(p_a, p_b) = 7 and least(p_a, p_b) in (5, 6))
  end;
$$;

-- A set cut by the time limit: not over and still possible (6-5, 6-6, 9-8 in a super tie-break).
create function private.set_partial(p_a integer, p_b integer, p_super boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not private.set_done(p_a, p_b, p_super)
    and case when p_super then greatest(p_a, p_b) < 10 or abs(p_a - p_b) <= 1 else p_a <= 6 and p_b <= 6 end;
$$;

-- 'a' or 'b': who won a match with these sets ([[6,4],[3,6],[10,8]]) under the category's rules. Without a time
-- limit somebody wins 2 sets; with one, the last set may be cut and the leader in sets, then in games, wins (a
-- super tie-break counts as one game). Anything else fails with invalid_result.
create function private.match_winner(p_sets jsonb, p_rules jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_limit boolean := (p_rules ->> 'time_limit_minutes') is not null;
  v_super_third boolean := coalesce(p_rules ->> 'third_set', 'super_tiebreak') = 'super_tiebreak';
  v_count integer;
  v_set jsonb;
  v_a integer;
  v_b integer;
  v_super boolean;
  v_won_a integer := 0;
  v_won_b integer := 0;
  v_games_a integer := 0;
  v_games_b integer := 0;
begin
  if p_sets is null or jsonb_typeof(p_sets) <> 'array' then
    perform private.fail('invalid_result');
  end if;
  v_count := jsonb_array_length(p_sets);
  if v_count not between 1 and 3 then
    perform private.fail('invalid_result');
  end if;
  for i in 0 .. v_count - 1 loop
    v_set := p_sets -> i;
    if jsonb_typeof(v_set) <> 'array' then
      perform private.fail('invalid_result');
    end if;
    if jsonb_array_length(v_set) <> 2
       or coalesce(v_set ->> 0, '') !~ '^[0-9]{1,2}$' or coalesce(v_set ->> 1, '') !~ '^[0-9]{1,2}$' then
      perform private.fail('invalid_result');
    end if;
    v_a := (v_set ->> 0)::integer;
    v_b := (v_set ->> 1)::integer;
    v_super := i = 2 and v_super_third;
    if v_won_a = 2 or v_won_b = 2 then
      perform private.fail('invalid_result');
    end if;
    if private.set_done(v_a, v_b, v_super) then
      if v_a > v_b then
        v_won_a := v_won_a + 1;
      else
        v_won_b := v_won_b + 1;
      end if;
    elsif not (i = v_count - 1 and v_limit and private.set_partial(v_a, v_b, v_super)) then
      perform private.fail('invalid_result');
    end if;
    if v_super then
      v_games_a := v_games_a + (v_a > v_b)::integer;
      v_games_b := v_games_b + (v_b > v_a)::integer;
    else
      v_games_a := v_games_a + v_a;
      v_games_b := v_games_b + v_b;
    end if;
  end loop;
  if not v_limit and greatest(v_won_a, v_won_b) < 2 then
    perform private.fail('invalid_result');
  end if;
  if v_won_a <> v_won_b then
    return case when v_won_a > v_won_b then 'a' else 'b' end;
  end if;
  if v_games_a <> v_games_b then
    return case when v_games_a > v_games_b then 'a' else 'b' end;
  end if;
  perform private.fail('invalid_result');
end;
$$;

-- Locks the championship of a match, checks the caller is its staff and that it is being played (published or
-- in progress), and reads the match again under the lock.
create function private.staff_match(p_match_id uuid)
returns public.championship_matches
language plpgsql
set search_path = ''
as $$
declare
  v_match public.championship_matches;
  v_championship public.championships;
begin
  select * into v_match from public.championship_matches where id = p_match_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_championship := private.staff_championship(v_match.championship_id);
  if v_championship.status not in ('published', 'in_progress') then
    perform private.fail('invalid_state');
  end if;
  select * into v_match from public.championship_matches where id = p_match_id;
  return v_match;
end;
$$;

-- The first match started or result recorded puts a published championship in progress.
create function private.mark_in_progress(p_championship_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.championships set status = 'in_progress' where id = p_championship_id and status = 'published';
$$;

-- The knockout matches waiting for this one: for its winner or, for a group match, for its group's places.
create function private.next_matches(p_match_id uuid)
returns setof public.championship_matches
language sql
stable
set search_path = ''
as $$
  select n.* from public.championship_matches m
  join public.championship_matches n
    on n.championship_id = m.championship_id and n.stage = 'knockout'
   and (n.source_a ->> 'winner_of' = m.id::text or n.source_b ->> 'winner_of' = m.id::text
        or (m.group_id is not null
            and (n.source_a ->> 'group' = m.group_id::text or n.source_b ->> 'group' = m.group_id::text)))
  where m.id = p_match_id;
$$;

-- Saves a result (or a W.O., with p_absent): its sets, the winner and the state. A result is corrected while
-- what comes next has not started; a knockout winner goes on by itself; a corrected group result opens its
-- group again (places and the pairs it sent on are cleared until it closes again).
create function private.apply_result(
  p_match public.championship_matches,
  p_sets jsonb,
  p_winner uuid,
  p_absent uuid
)
returns public.championship_matches
language plpgsql
set search_path = ''
as $$
declare
  v_category public.championship_categories;
  v_match public.championship_matches;
begin
  if p_match.status in ('finished', 'walkover')
     and exists (select 1 from private.next_matches(p_match.id) n where n.status <> 'scheduled') then
    perform private.fail('invalid_state');
  end if;
  select * into v_category from public.championship_categories where id = p_match.category_id;

  delete from public.championship_match_sets where match_id = p_match.id;
  insert into public.championship_match_sets (match_id, club_id, set_number, games_a, games_b, super_tiebreak)
  select p_match.id, p_match.club_id, s.n, (s.item ->> 0)::smallint, (s.item ->> 1)::smallint,
         s.n = 3 and coalesce(v_category.match_rules ->> 'third_set', 'super_tiebreak') = 'super_tiebreak'
  from jsonb_array_elements(p_sets) with ordinality as s (item, n);

  update public.championship_matches
     set status = (case when p_absent is null then 'finished' else 'walkover' end)::public.championship_match_status,
         winner_entry_id = p_winner, walkover_entry_id = p_absent,
         recorded_by = (select auth.uid()), recorded_at = now()
   where id = p_match.id
  returning * into v_match;

  if v_match.stage = 'knockout' then
    update public.championship_matches set entry_a_id = p_winner where source_a ->> 'winner_of' = v_match.id::text;
    update public.championship_matches set entry_b_id = p_winner where source_b ->> 'winner_of' = v_match.id::text;
  elsif p_match.status in ('finished', 'walkover') then
    update public.championship_group_members set place = null where group_id = v_match.group_id;
    update public.championship_matches set entry_a_id = null where source_a ->> 'group' = v_match.group_id::text;
    update public.championship_matches set entry_b_id = null where source_b ->> 'group' = v_match.group_id::text;
  end if;
  perform private.mark_in_progress(v_match.championship_id);
  return v_match;
end;
$$;

-- "Empezar": the match is being played (both pairs known).
create function public.start_match(p_match_id uuid)
returns public.championship_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.championship_matches := private.staff_match(p_match_id);
begin
  if v_match.status <> 'scheduled' or v_match.entry_a_id is null or v_match.entry_b_id is null then
    perform private.fail('invalid_state');
  end if;
  update public.championship_matches set status = 'playing' where id = v_match.id returning * into v_match;
  perform private.mark_in_progress(v_match.championship_id);
  return v_match;
end;
$$;

-- "Cargar resultado": the sets as [[games a, games b], ...].
create function public.record_match_result(p_match_id uuid, p_sets jsonb)
returns public.championship_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.championship_matches := private.staff_match(p_match_id);
  v_rules jsonb;
  v_side text;
begin
  if v_match.entry_a_id is null or v_match.entry_b_id is null then
    perform private.fail('invalid_state');
  end if;
  select match_rules into v_rules from public.championship_categories where id = v_match.category_id;
  v_side := private.match_winner(p_sets, v_rules);
  return private.apply_result(v_match, p_sets,
                              case when v_side = 'a' then v_match.entry_a_id else v_match.entry_b_id end, null);
end;
$$;

-- "W.O.": the pair that did not show up loses 6-0 6-0.
create function public.record_walkover(p_match_id uuid, p_absent_entry_id uuid)
returns public.championship_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.championship_matches := private.staff_match(p_match_id);
  v_winner uuid;
begin
  if v_match.entry_a_id is null or v_match.entry_b_id is null then
    perform private.fail('invalid_state');
  end if;
  if p_absent_entry_id is null or p_absent_entry_id not in (v_match.entry_a_id, v_match.entry_b_id) then
    perform private.fail('invalid_input');
  end if;
  v_winner := case when p_absent_entry_id = v_match.entry_a_id then v_match.entry_b_id else v_match.entry_a_id end;
  return private.apply_result(v_match,
    case when v_winner = v_match.entry_a_id then '[[6,0],[6,0]]' else '[[0,6],[0,6]]' end::jsonb,
    v_winner, p_absent_entry_id);
end;
$$;

-- Closes a group with its final order (lib/domain/championship-standings.ts computes it; a tie that remains is
-- the organizer's): every match played, every pair once, nobody above a pair that won more. Its places go to the
-- bracket.
create function public.close_championship_group(p_group_id uuid, p_entry_ids uuid[])
returns public.championship_groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.championship_groups;
  v_championship public.championships;
begin
  select * into v_group from public.championship_groups where id = p_group_id;
  if not found then
    perform private.fail('not_found');
  end if;
  v_championship := private.staff_championship(v_group.championship_id);
  if v_championship.status not in ('published', 'in_progress') then
    perform private.fail('invalid_state');
  end if;
  if exists (select 1 from public.championship_matches
             where group_id = v_group.id and status not in ('finished', 'walkover')) then
    perform private.fail('scores_missing');
  end if;
  if p_entry_ids is null
     or cardinality(p_entry_ids) <> (select count(*) from public.championship_group_members where group_id = v_group.id)
     or (select count(distinct e) from unnest(p_entry_ids) as e) <> cardinality(p_entry_ids)
     or exists (
       select 1 from unnest(p_entry_ids) as e (id)
       where not exists (select 1 from public.championship_group_members gm
                         where gm.group_id = v_group.id and gm.entry_id = e.id)
     ) then
    perform private.fail('invalid_input');
  end if;
  if exists (
    with wins as (
      select s.id, s.n,
             (select count(*) from public.championship_matches m
              where m.group_id = v_group.id and m.winner_entry_id = s.id) as won
      from unnest(p_entry_ids) with ordinality as s (id, n)
    )
    select 1 from wins a join wins b on b.n = a.n + 1 where b.won > a.won
  ) then
    perform private.fail('invalid_input');
  end if;
  if exists (
    select 1 from public.championship_matches n
    where n.championship_id = v_group.championship_id and n.status <> 'scheduled'
      and (n.source_a ->> 'group' = v_group.id::text or n.source_b ->> 'group' = v_group.id::text)
  ) then
    perform private.fail('invalid_state');
  end if;

  update public.championship_group_members set place = null where group_id = v_group.id;
  update public.championship_group_members gm set place = s.n
    from unnest(p_entry_ids) with ordinality as s (id, n)
   where gm.group_id = v_group.id and gm.entry_id = s.id;
  update public.championship_matches n
     set entry_a_id = (select gm.entry_id from public.championship_group_members gm
                       where gm.group_id = v_group.id and gm.place = (n.source_a ->> 'place')::integer)
   where n.championship_id = v_group.championship_id and n.source_a ->> 'group' = v_group.id::text;
  update public.championship_matches n
     set entry_b_id = (select gm.entry_id from public.championship_group_members gm
                       where gm.group_id = v_group.id and gm.place = (n.source_b ->> 'place')::integer)
   where n.championship_id = v_group.championship_id and n.source_b ->> 'group' = v_group.id::text;
  perform private.mark_in_progress(v_group.championship_id);
  return v_group;
end;
$$;

-- "Finalizar": every match played and every group closed.
create function public.finish_championship(p_championship_id uuid)
returns public.championships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_championship public.championships := private.staff_championship(p_championship_id);
begin
  if v_championship.status <> 'in_progress' then
    perform private.fail('invalid_state');
  end if;
  if exists (select 1 from public.championship_matches
             where championship_id = v_championship.id and status not in ('finished', 'walkover'))
     or exists (select 1 from public.championship_group_members gm
                join public.championship_groups g on g.id = gm.group_id
                where g.championship_id = v_championship.id and gm.place is null) then
    perform private.fail('scores_missing');
  end if;
  update public.championships set status = 'finished' where id = v_championship.id returning * into v_championship;
  return v_championship;
end;
$$;

revoke all on function private.set_done(integer, integer, boolean) from public;
revoke all on function private.set_partial(integer, integer, boolean) from public;
revoke all on function private.match_winner(jsonb, jsonb) from public;
revoke all on function private.staff_match(uuid) from public;
revoke all on function private.mark_in_progress(uuid) from public;
revoke all on function private.next_matches(uuid) from public;
revoke all on function private.apply_result(public.championship_matches, jsonb, uuid, uuid) from public;
revoke execute on function public.start_match(uuid) from public, anon;
revoke execute on function public.record_match_result(uuid, jsonb) from public, anon;
revoke execute on function public.record_walkover(uuid, uuid) from public, anon;
revoke execute on function public.close_championship_group(uuid, uuid[]) from public, anon;
revoke execute on function public.finish_championship(uuid) from public, anon;
grant execute on function public.start_match(uuid) to authenticated;
grant execute on function public.record_match_result(uuid, jsonb) to authenticated;
grant execute on function public.record_walkover(uuid, uuid) to authenticated;
grant execute on function public.close_championship_group(uuid, uuid[]) to authenticated;
grant execute on function public.finish_championship(uuid) to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/championship_results.test.sql
npm run db:types
```
Expected: PASS (35 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261007000160_championship_results.sql supabase/tests/database/championship_results.test.sql lib/supabase/database.types.ts
git commit -m "feat(db): results, walkovers, closing groups and finishing a championship"
```

---

### Task 8: La página pública en la base

**Files:**
- Create: `supabase/tests/database/championship_public.test.sql`
- Create: `supabase/migrations/20261007000170_public_championship.sql`
- Modify: `supabase/tests/database/integrity.test.sql:9-13`
- Modify: `lib/supabase/database.types.ts` (generado)

- [ ] **Step 1: Write the failing test** (con la herramienta Write)

`supabase/tests/database/championship_public.test.sql`:
```sql
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
```

- [ ] **Step 2: Integrity: `anon` ejecuta solo esa función**

In `supabase/tests/database/integrity.test.sql`, replace:
```sql
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute') $$,
  'anon cannot execute any function in public or private');
```
with:
```sql
select is(
  array(select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')
        order by 1),
  array['public.public_championship'],
  'anon executes only public_championship (the read-only public page of a championship)');
```

In `supabase/tests/database/integrity.test.sql`, replace:
```sql
-- Grants: Supabase gives EXECUTE on new public functions to anon by default. None of ours may keep it,
-- and authenticated never runs the private helpers that write or skip the permission checks.
```
with:
```sql
-- Grants: Supabase gives EXECUTE on new public functions to anon by default. None of ours may keep it but the
-- public page of a championship, and authenticated never runs the private helpers that write or skip the
-- permission checks.
```

- [ ] **Step 3: Run tests to verify they fail**

Run:
```bash
npx supabase test db supabase/tests/database/championship_public.test.sql
npx supabase test db supabase/tests/database/integrity.test.sql
```
Expected: FAIL — `function public.public_championship(unknown) does not exist`, e `integrity` con `have: {}`.

- [ ] **Step 4: Write minimal implementation**

`supabase/migrations/20261007000170_public_championship.sql`:
```sql
-- Campeonatos, día del torneo, part 6: the public page (/c/<code>), for anyone with the link. The only function
-- anon may run (integrity.test.sql pins it): read-only, and only public data. Names, dates, rules, categories,
-- pairs (names only), and once published the groups and matches with their results. Nothing for a draft or a
-- cancelled championship; never phones, payments, notes or profile ids.
create function public.public_championship(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'club', jsonb_build_object('name', cl.name, 'logo_path', cl.logo_path, 'timezone', cl.timezone),
    'championship', jsonb_build_object('id', ch.id, 'name', ch.name, 'rules', ch.rules, 'status', ch.status,
                                       'public_code', ch.public_code, 'poster_path', ch.poster_path),
    'windows', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'on_date', w.on_date, 'from_time', w.from_time,
                                          'to_time', w.to_time, 'court_ids', w.court_ids)
                       order by w.on_date, w.from_time)
      from public.championship_windows w where w.championship_id = ch.id), '[]'::jsonb),
    'courts', coalesce((
      select jsonb_agg(jsonb_build_object('id', co.id, 'name', co.name) order by co.sort_order)
      from public.courts co where co.club_id = ch.club_id), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'name', c.name, 'gender', c.gender, 'format', c.format, 'group_size', c.group_size,
               'qualifiers_per_group', c.qualifiers_per_group, 'match_minutes', c.match_minutes,
               'match_rules', c.match_rules, 'sort_order', c.sort_order,
               'entries', coalesce((
                 select jsonb_agg(jsonb_build_object('id', e.id, 'player1_name', p1.name, 'player2_name', p2.name)
                                  order by e.created_at, e.id)
                 from public.championship_entries e
                 join public.players p1 on p1.id = e.player1_id
                 join public.players p2 on p2.id = e.player2_id
                 where e.category_id = c.id and e.status = 'active'), '[]'::jsonb))
             order by c.sort_order, c.name)
      from public.championship_categories c where c.championship_id = ch.id and c.status = 'open'), '[]'::jsonb),
    'groups', case when ch.status in ('published', 'in_progress', 'finished') then coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'category_id', g.category_id, 'name', g.name, 'sort_order', g.sort_order,
               'members', coalesce((
                 select jsonb_agg(jsonb_build_object('entry_id', gm.entry_id, 'draw_position', gm.draw_position,
                                                     'place', gm.place) order by gm.draw_position)
                 from public.championship_group_members gm where gm.group_id = g.id), '[]'::jsonb))
             order by g.sort_order)
      from public.championship_groups g where g.championship_id = ch.id), '[]'::jsonb) else '[]'::jsonb end,
    'matches', case when ch.status in ('published', 'in_progress', 'finished') then coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'category_id', m.category_id, 'stage', m.stage, 'group_id', m.group_id,
               'round', m.round, 'bracket_position', m.bracket_position, 'entry_a_id', m.entry_a_id,
               'entry_b_id', m.entry_b_id, 'source_a', m.source_a, 'source_b', m.source_b,
               'court_id', m.court_id, 'starts_at', m.starts_at, 'ends_at', m.ends_at, 'pinned', m.pinned,
               'status', m.status, 'winner_entry_id', m.winner_entry_id,
               'walkover_entry_id', m.walkover_entry_id,
               'sets', coalesce((
                 select jsonb_agg(jsonb_build_object('set_number', s.set_number, 'games_a', s.games_a,
                                                     'games_b', s.games_b, 'super_tiebreak', s.super_tiebreak)
                                  order by s.set_number)
                 from public.championship_match_sets s where s.match_id = m.id), '[]'::jsonb))
             order by m.starts_at nulls last, m.id)
      from public.championship_matches m where m.championship_id = ch.id), '[]'::jsonb) else '[]'::jsonb end
  )
  from public.championships ch
  join public.clubs cl on cl.id = ch.club_id
  where ch.public_code = p_code and ch.status not in ('draft', 'cancelled');
$$;

revoke all on function public.public_championship(text) from public;
grant execute on function public.public_championship(text) to anon, authenticated;
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/championship_public.test.sql
npm run test:db
npm run db:types
```
Expected: PASS (14 tests) y todo el pgTAP en verde (incluido `integrity.test.sql`).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261007000170_public_championship.sql supabase/tests/database/championship_public.test.sql supabase/tests/database/integrity.test.sql lib/supabase/database.types.ts
git commit -m "feat(db): public_championship, the only function anon runs"
```

---

## Corte 3: Dominio TS

### Task 9: Errores nuevos

**Files:**
- Modify: `lib/domain/errors.ts`
- Test: `tests/unit/lib/domain/errors.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/unit/lib/domain/errors.test.ts`, replace:
```ts
  'same_player', 'partner_not_member', 'invalid_phone', 'too_many_unavailable',
]
```
with:
```ts
  'same_player', 'partner_not_member', 'invalid_phone', 'too_many_unavailable',
  'category_too_small', 'outside_play_days', 'pair_busy', 'unavailable_pair', 'too_early', 'schedule_incomplete',
  'invalid_result',
]
```

Append to `tests/unit/lib/domain/errors.test.ts`:
```ts

describe('the fixture of a championship', () => {
  it('explains the draw, schedule and result rules in words', () => {
    expect(errorMessage('category_too_small')).toBe(
      'Hay una categoría con menos de 2 parejas. Fusionala o cancelala antes de sortear.',
    )
    expect(errorMessage('pair_busy')).toBe('Alguno de los jugadores ya juega o descansa a esa hora (45 minutos entre partidos).')
    expect(errorMessage('too_early')).toBe('Ese partido tiene que empezar 45 minutos después de los partidos que lo definen.')
    expect(errorMessage('invalid_result')).toBe('Ese resultado no es posible con las reglas de la categoría.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/errors.test.ts`
Expected: FAIL — `translates category_too_small` (y los demás códigos nuevos) dan el mensaje genérico.

- [ ] **Step 3: Write minimal implementation**

In `lib/domain/errors.ts`, replace:
```ts
  too_many_unavailable: 'Marcaste más del 40 % de los horarios. Para más, pedíselo al club.',
} as const
```
with:
```ts
  too_many_unavailable: 'Marcaste más del 40 % de los horarios. Para más, pedíselo al club.',
  category_too_small: 'Hay una categoría con menos de 2 parejas. Fusionala o cancelala antes de sortear.',
  outside_play_days: 'Ese horario queda fuera de los días de juego o de sus canchas.',
  pair_busy: 'Alguno de los jugadores ya juega o descansa a esa hora (45 minutos entre partidos).',
  unavailable_pair: 'Esa pareja marcó que no puede jugar a esa hora.',
  too_early: 'Ese partido tiene que empezar 45 minutos después de los partidos que lo definen.',
  schedule_incomplete: 'Faltan partidos por ubicar. Programalos o movelos a mano antes de publicar.',
  invalid_result: 'Ese resultado no es posible con las reglas de la categoría.',
} as const
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/errors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/errors.ts tests/unit/lib/domain/errors.test.ts
git commit -m "feat: messages for the championship fixture errors"
```

---

### Task 10: El fixture en TS (`lib/domain/championship-fixture.ts`)

**Files:**
- Create: `lib/domain/championship-fixture.ts`
- Create: `tests/unit/fixtures/championship-fixture.ts`
- Modify: `lib/domain/championships.ts` (seed de cada pareja y `publicCode`)
- Modify: `lib/data/championships.ts:10`
- Modify: `tests/unit/fixtures/championships.ts`
- Test: `tests/unit/lib/domain/championship-fixture.test.ts`, `tests/unit/lib/domain/championships.test.ts`

- [ ] **Step 1: Fixture de Vitest**

`tests/unit/fixtures/championship-fixture.ts`:
```ts
import type { FixtureGroup, FixtureMatch, GroupMember, MatchSet } from '@/lib/domain/championship-fixture'

// A group match of '6ta Libre' (k1) in Zona A (g1): e1 against e2, without a court yet.
export function makeMatch(overrides: Partial<FixtureMatch> = {}): FixtureMatch {
  return {
    id: 'm1',
    categoryId: 'k1',
    stage: 'group',
    groupId: 'g1',
    round: null,
    position: null,
    entryA: 'e1',
    entryB: 'e2',
    sourceA: null,
    sourceB: null,
    courtId: null,
    startsAt: null,
    endsAt: null,
    pinned: false,
    status: 'scheduled',
    winner: null,
    absent: null,
    sets: [],
    ...overrides,
  }
}

// Zona A of k1, with no pairs unless given.
export function makeGroup(overrides: Partial<FixtureGroup> = {}): FixtureGroup {
  return { id: 'g1', categoryId: 'k1', name: 'Zona A', sortOrder: 0, members: [], ...overrides }
}

export function members(entryIds: string[]): GroupMember[] {
  return entryIds.map((entryId, index) => ({ entryId, drawPosition: index + 1, place: null }))
}

export function set(a: number, b: number, superTiebreak = false): MatchSet {
  return { a, b, superTiebreak }
}

// A match of Zona A already played: side a or b wins, 6-3 6-3 unless other sets are given.
export function played(id: string, entryA: string, entryB: string, winner: 'a' | 'b', sets?: MatchSet[]): FixtureMatch {
  return makeMatch({
    id,
    entryA,
    entryB,
    status: 'finished',
    winner: winner === 'a' ? entryA : entryB,
    sets: sets ?? (winner === 'a' ? [set(6, 3), set(6, 3)] : [set(3, 6), set(3, 6)]),
  })
}
```

- [ ] **Step 2: Write the failing test**

`tests/unit/lib/domain/championship-fixture.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  isDone,
  knockoutCode,
  knockoutLabel,
  matchName,
  readSource,
  roundName,
  scoreText,
  sideName,
  toFixture,
  type MatchRow,
} from '@/lib/domain/championship-fixture'
import { makeGroup, makeMatch, members, set } from '../../fixtures/championship-fixture'

const FINAL: MatchRow = {
  id: 'm2',
  category_id: 'k1',
  stage: 'knockout',
  group_id: null,
  round: 1,
  bracket_position: 1,
  entry_a_id: null,
  entry_b_id: null,
  source_a: { group: 'g1', place: 1 },
  source_b: { winner_of: 'm1' },
  court_id: 'court-1',
  starts_at: '2026-10-17T20:00:00+00:00',
  ends_at: '2026-10-17T21:30:00+00:00',
  pinned: true,
  status: 'scheduled',
  winner_entry_id: null,
  walkover_entry_id: null,
  sets: [],
}

describe('toFixture', () => {
  it('reads the groups and the matches the database returns, in order', () => {
    const fixture = toFixture(
      [
        {
          id: 'g1',
          category_id: 'k1',
          name: 'Zona A',
          sort_order: 0,
          members: [
            { entry_id: 'e2', draw_position: 2, place: null },
            { entry_id: 'e1', draw_position: 1, place: 1 },
          ],
        },
      ],
      [
        FINAL,
        {
          ...FINAL,
          id: 'm1',
          stage: 'group',
          group_id: 'g1',
          round: null,
          bracket_position: null,
          entry_a_id: 'e1',
          entry_b_id: 'e2',
          source_a: null,
          source_b: null,
          pinned: false,
          status: 'finished',
          winner_entry_id: 'e1',
          sets: [
            { set_number: 2, games_a: 6, games_b: 3, super_tiebreak: false },
            { set_number: 1, games_a: 6, games_b: 4, super_tiebreak: false },
          ],
        },
      ],
    )
    expect(fixture.groups[0].members).toEqual([
      { entryId: 'e1', drawPosition: 1, place: 1 },
      { entryId: 'e2', drawPosition: 2, place: null },
    ])
    expect(fixture.matches.map((match) => match.id)).toEqual(['m1', 'm2'])
    expect(fixture.matches[0].sets).toEqual([set(6, 4), set(6, 3)])
    expect(fixture.matches[1]).toMatchObject({
      sourceA: { kind: 'group', groupId: 'g1', place: 1 },
      sourceB: { kind: 'winner', matchId: 'm1' },
      startsAt: new Date('2026-10-17T20:00:00Z'),
      pinned: true,
    })
  })
})

describe('readSource', () => {
  it('reads a group place or a winner, and nothing else', () => {
    expect(readSource({ group: 'g1', place: 2 })).toEqual({ kind: 'group', groupId: 'g1', place: 2 })
    expect(readSource({ winner_of: 'm1' })).toEqual({ kind: 'winner', matchId: 'm1' })
    expect(readSource(null)).toBeNull()
    expect(readSource({ group: 'g1' })).toBeNull()
    expect(readSource('m1')).toBeNull()
  })
})

describe('names', () => {
  it('names the rounds and the knockout matches', () => {
    expect(roundName(2)).toBe('Semifinal')
    expect(roundName(16)).toBe('Ronda de 32')
    expect(knockoutLabel(1, 1)).toBe('Final')
    expect(knockoutLabel(4, 3)).toBe('Cuartos de final 3')
    expect(knockoutCode(1, 1)).toBe('Final')
    expect(knockoutCode(2, 1)).toBe('SF1')
    expect(knockoutCode(8, 2)).toBe('OF2')
  })

  it('names each side: the pair, or where it comes from', () => {
    const semifinal = makeMatch({ id: 's1', stage: 'knockout', groupId: null, round: 2, position: 1 })
    const final = makeMatch({
      id: 'f',
      stage: 'knockout',
      groupId: null,
      round: 1,
      position: 1,
      entryA: null,
      entryB: null,
      sourceA: { kind: 'group', groupId: 'g1', place: 1 },
      sourceB: { kind: 'winner', matchId: 's1' },
    })
    const fixture = { groups: [makeGroup({ members: members(['e1', 'e2']) })], matches: [makeMatch(), semifinal, final] }
    const name = (entryId: string) => (entryId === 'e1' ? 'Ana y Pedro' : 'Bruno y Lucía')
    expect(sideName(fixture, fixture.matches[0], 'a', name)).toBe('Ana y Pedro')
    expect(sideName(fixture, final, 'a', name)).toBe('1° Zona A')
    expect(sideName(fixture, final, 'b', name)).toBe('Ganador SF1')
    expect(matchName(fixture, fixture.matches[0])).toBe('Zona A')
    expect(matchName(fixture, semifinal)).toBe('Semifinal 1')
  })
})

describe('scores', () => {
  it('shows the sets, or W.O.', () => {
    expect(scoreText(makeMatch({ status: 'finished', sets: [set(6, 4), set(3, 6), set(10, 8, true)] }))).toBe('6-4 3-6 10-8')
    expect(scoreText(makeMatch({ status: 'walkover', sets: [set(6, 0), set(6, 0)] }))).toBe('W.O.')
    expect(scoreText(makeMatch())).toBeNull()
  })

  it('knows which matches are over', () => {
    expect(isDone(makeMatch({ status: 'finished' }))).toBe(true)
    expect(isDone(makeMatch({ status: 'walkover' }))).toBe(true)
    expect(isDone(makeMatch({ status: 'playing' }))).toBe(false)
  })
})
```

Append to `tests/unit/lib/domain/championships.test.ts`:
```ts

describe('the draw and the public link', () => {
  it('reads each pair\'s seed and the public code', () => {
    const championship = toChampionship(
      {
        ...ROW,
        public_code: 'primavera-7k2f',
        categories: ROW.categories.map((category) => ({
          ...category,
          entries: category.entries.map((entry) => ({ ...entry, seed: entry.id === 'e1' ? 1 : null })),
        })),
      },
      TIMEZONE,
    )
    expect(championship.publicCode).toBe('primavera-7k2f')
    expect(championship.categories[0].entries.map((entry) => entry.seed)).toEqual([1, null])
  })

  it('has none when the database did not send them', () => {
    const championship = toChampionship(ROW, TIMEZONE)
    expect(championship.publicCode).toBeNull()
    expect(championship.categories[0].entries[0].seed).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/domain/championship-fixture.test.ts tests/unit/lib/domain/championships.test.ts`
Expected: FAIL — `Cannot find module '@/lib/domain/championship-fixture'` y `publicCode` es `undefined`.

- [ ] **Step 4: El fixture**

`lib/domain/championship-fixture.ts`:
```ts
// The draw and the matches of a championship as the screens read them (supabase/migrations/20261007*): groups
// with their pairs in draw order, matches with their court, start, state and sets. A side not known yet says
// where it comes from: a group's place or the winner of a match.

export const MATCH_STATUSES = ['scheduled', 'playing', 'finished', 'walkover'] as const
export type MatchStatus = (typeof MATCH_STATUSES)[number]
export type MatchStage = 'group' | 'knockout'
export type MatchSource = { kind: 'group'; groupId: string; place: number } | { kind: 'winner'; matchId: string }
export type MatchSet = { a: number; b: number; superTiebreak: boolean }
export type FixtureMatch = {
  id: string
  categoryId: string
  stage: MatchStage
  groupId: string | null
  // Knockout: 1 = final, 2 = semifinals, 4 = quarterfinals...; position goes from 1 to round.
  round: number | null
  position: number | null
  entryA: string | null
  entryB: string | null
  sourceA: MatchSource | null
  sourceB: MatchSource | null
  courtId: string | null
  startsAt: Date | null
  endsAt: Date | null
  pinned: boolean
  status: MatchStatus
  winner: string | null
  // W.O.: the pair that did not show up.
  absent: string | null
  sets: MatchSet[]
}
export type GroupMember = { entryId: string; drawPosition: number; place: number | null }
export type FixtureGroup = { id: string; categoryId: string; name: string; sortOrder: number; members: GroupMember[] }
export type Fixture = { groups: FixtureGroup[]; matches: FixtureMatch[] }

export const EMPTY_FIXTURE: Fixture = { groups: [], matches: [] }

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  scheduled: 'Programado',
  playing: 'En juego',
  finished: 'Terminado',
  walkover: 'W.O.',
}

// What lib/data/championship-fixture.ts and public_championship return. If supabase-js infers a slightly
// different shape for the embeds, adjust these types to match; never cast the query result.
export type SetRow = { set_number: number; games_a: number; games_b: number; super_tiebreak: boolean }
export type MatchRow = {
  id: string
  category_id: string
  stage: MatchStage
  group_id: string | null
  round: number | null
  bracket_position: number | null
  entry_a_id: string | null
  entry_b_id: string | null
  source_a: unknown
  source_b: unknown
  court_id: string | null
  starts_at: string | null
  ends_at: string | null
  pinned: boolean
  status: MatchStatus
  winner_entry_id: string | null
  walkover_entry_id: string | null
  sets: SetRow[]
}
export type GroupRow = {
  id: string
  category_id: string
  name: string
  sort_order: number
  members: { entry_id: string; draw_position: number; place: number | null }[]
}

const ROUND_NAMES: Record<number, string> = { 1: 'Final', 2: 'Semifinal', 4: 'Cuartos de final', 8: 'Octavos de final' }
const ROUND_CODES: Record<number, string> = { 2: 'SF', 4: 'CF', 8: 'OF' }

export function roundName(round: number): string {
  return ROUND_NAMES[round] ?? `Ronda de ${round * 2}`
}

// "Final", "Semifinal 1", "Cuartos de final 3".
export function knockoutLabel(round: number, position: number): string {
  return round === 1 ? 'Final' : `${roundName(round)} ${position}`
}

// "Final", "SF1", "CF3": how a side waiting for a winner names the match ("Ganador SF1").
export function knockoutCode(round: number, position: number): string {
  return round === 1 ? 'Final' : `${ROUND_CODES[round] ?? `R${round * 2}-`}${position}`
}

// {"group": id, "place": 1} or {"winner_of": id}; anything else reads as null.
export function readSource(value: unknown): MatchSource | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.winner_of === 'string') return { kind: 'winner', matchId: record.winner_of }
  if (typeof record.group === 'string' && typeof record.place === 'number') {
    return { kind: 'group', groupId: record.group, place: record.place }
  }
  return null
}

function toMatch(row: MatchRow): FixtureMatch {
  return {
    id: row.id,
    categoryId: row.category_id,
    stage: row.stage,
    groupId: row.group_id,
    round: row.round,
    position: row.bracket_position,
    entryA: row.entry_a_id,
    entryB: row.entry_b_id,
    sourceA: readSource(row.source_a),
    sourceB: readSource(row.source_b),
    courtId: row.court_id,
    startsAt: row.starts_at ? new Date(row.starts_at) : null,
    endsAt: row.ends_at ? new Date(row.ends_at) : null,
    pinned: row.pinned,
    status: row.status,
    winner: row.winner_entry_id,
    absent: row.walkover_entry_id,
    sets: [...row.sets]
      .sort((a, b) => a.set_number - b.set_number)
      .map((item) => ({ a: item.games_a, b: item.games_b, superTiebreak: item.super_tiebreak })),
  }
}

// Groups in their order; matches by category, groups before the bracket, the first rounds first.
export function toFixture(groups: GroupRow[], matches: MatchRow[]): Fixture {
  const groupOrder = new Map(groups.map((group) => [group.id, group.sort_order]))
  return {
    groups: groups
      .map((row) => ({
        id: row.id,
        categoryId: row.category_id,
        name: row.name,
        sortOrder: row.sort_order,
        members: [...row.members]
          .sort((a, b) => a.draw_position - b.draw_position)
          .map((member) => ({ entryId: member.entry_id, drawPosition: member.draw_position, place: member.place })),
      }))
      .sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.sortOrder - b.sortOrder),
    matches: matches
      .map(toMatch)
      .sort(
        (a, b) =>
          a.categoryId.localeCompare(b.categoryId) ||
          (a.stage === 'group' ? 0 : 1) - (b.stage === 'group' ? 0 : 1) ||
          (groupOrder.get(a.groupId ?? '') ?? 0) - (groupOrder.get(b.groupId ?? '') ?? 0) ||
          (b.round ?? 0) - (a.round ?? 0) ||
          (a.position ?? 0) - (b.position ?? 0) ||
          a.id.localeCompare(b.id),
      ),
  }
}

export function isDone(match: Pick<FixtureMatch, 'status'>): boolean {
  return match.status === 'finished' || match.status === 'walkover'
}

// "Zona A" or "Semifinal 1".
export function matchName(fixture: Fixture, match: FixtureMatch): string {
  if (match.stage === 'group') return fixture.groups.find((group) => group.id === match.groupId)?.name ?? 'Zona'
  return knockoutLabel(match.round ?? 1, match.position ?? 1)
}

// The pair, or where it comes from: "1° Zona A", "Ganador SF1".
export function sideName(
  fixture: Fixture,
  match: FixtureMatch,
  side: 'a' | 'b',
  entryName: (entryId: string) => string,
): string {
  const entryId = side === 'a' ? match.entryA : match.entryB
  if (entryId) return entryName(entryId)
  const source = side === 'a' ? match.sourceA : match.sourceB
  if (source?.kind === 'group') {
    return `${source.place}° ${fixture.groups.find((group) => group.id === source.groupId)?.name ?? 'Zona'}`
  }
  if (source?.kind === 'winner') {
    const feeder = fixture.matches.find((item) => item.id === source.matchId)
    return feeder ? `Ganador ${knockoutCode(feeder.round ?? 1, feeder.position ?? 1)}` : 'A definir'
  }
  return 'A definir'
}

// "6-4 3-6 10-8", "W.O." or null before any result.
export function scoreText(match: Pick<FixtureMatch, 'status' | 'sets'>): string | null {
  if (match.status === 'walkover') return 'W.O.'
  if (match.sets.length === 0) return null
  return match.sets.map((item) => `${item.a}-${item.b}`).join(' ')
}
```

- [ ] **Step 5: El seed de cada pareja y el código público**

In `lib/domain/championships.ts`, replace:
```ts
  status: EntryStatus
  note: string | null
  unavailabilityNote: string | null
```
with:
```ts
  status: EntryStatus
  // The organizer's seed (1 = strongest) for the draw; null for none.
  seed: number | null
  note: string | null
  unavailabilityNote: string | null
```

In `lib/domain/championships.ts`, replace:
```ts
  posterPath: string | null
  status: ChampionshipStatus
```
with:
```ts
  posterPath: string | null
  // The public link (/c/<code>), made when the fixture is published.
  publicCode: string | null
  status: ChampionshipStatus
```

In `lib/domain/championships.ts`, replace:
```ts
  status: EntryStatus
  unavailability_approved: boolean
```
with:
```ts
  status: EntryStatus
  seed?: number | null
  unavailability_approved: boolean
```

In `lib/domain/championships.ts`, replace:
```ts
  poster_path: string | null
  status: ChampionshipStatus
```
with:
```ts
  poster_path: string | null
  public_code?: string | null
  status: ChampionshipStatus
```

In `lib/domain/championships.ts`, replace:
```ts
    status: row.status,
    note: notes.get(row.id)?.note ?? null,
```
with:
```ts
    status: row.status,
    seed: row.seed ?? null,
    note: notes.get(row.id)?.note ?? null,
```

In `lib/domain/championships.ts`, replace:
```ts
    posterPath: row.poster_path,
    status: row.status,
```
with:
```ts
    posterPath: row.poster_path,
    publicCode: row.public_code ?? null,
    status: row.status,
```

In `lib/data/championships.ts`, replace:
```ts
  'id, name, rules, poster_path, status, registration_opens_at,
```
with:
```ts
  'id, name, rules, poster_path, public_code, status, registration_opens_at,
```

In `lib/data/championships.ts`, replace:
```ts
entries:championship_entries!championship_entries_category_in_club(id, player1_level, player2_level, status, unavailability_approved,
```
with:
```ts
entries:championship_entries!championship_entries_category_in_club(id, player1_level, player2_level, status, seed, unavailability_approved,
```

In `tests/unit/fixtures/championships.ts`, replace:
```ts
    status: 'active',
    note: null,
```
with:
```ts
    status: 'active',
    seed: null,
    note: null,
```

In `tests/unit/fixtures/championships.ts`, replace:
```ts
    posterPath: null,
    status: 'registration',
```
with:
```ts
    posterPath: null,
    publicCode: null,
    status: 'registration',
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/lib/domain/championship-fixture.test.ts tests/unit/lib/domain/championships.test.ts
npm test
npm run typecheck
```
Expected: PASS; typecheck sin errores (si algún otro lugar arma un `ChampionshipEntry` o un `Championship` a mano, sumarle `seed: null` o `publicCode: null`).

- [ ] **Step 7: Commit**

```bash
git add lib/domain/championship-fixture.ts lib/domain/championships.ts lib/data/championships.ts tests/unit/fixtures/championship-fixture.ts tests/unit/fixtures/championships.ts tests/unit/lib/domain/championship-fixture.test.ts tests/unit/lib/domain/championships.test.ts
git commit -m "feat: championship fixture types, labels, seeds and public code"
```

---

### Task 11: El sorteo (`lib/domain/championship-draw.ts`)

**Files:**
- Create: `lib/domain/championship-draw.ts`
- Test: `tests/unit/lib/domain/championship-draw.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/domain/championship-draw.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  bracketOrder,
  drawCategories,
  drawCategory,
  drawChampionship,
  drawPayload,
  groupSizes,
  roundRobinPairs,
  seedOrder,
  type CategoryDraw,
  type DrawCategory,
  type DrawEntry,
} from '@/lib/domain/championship-draw'
import { makeCategory, makeChampionship, makeEntry } from '../../fixtures/championships'

// count pairs, strongest first: e1 and e2 declare 3ª and 3ª, e3 and e4 4ª and 4ª..., one minute apart.
function entries(count: number): DrawEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `e${index + 1}`,
    level1: 3 + Math.floor(index / 2),
    level2: 3 + Math.floor(index / 2),
    seed: null,
    createdAt: new Date(Date.UTC(2026, 9, 1, 12, index)),
  }))
}

function category(overrides: Partial<DrawCategory> = {}): DrawCategory {
  return { id: 'k1', name: '6ta Libre', format: 'groups_knockout', groupSize: 4, qualifiers: 2, entries: entries(10), ...overrides }
}

function draw(overrides: Partial<DrawCategory> = {}, seed = 1): CategoryDraw {
  const result = drawCategory(category(overrides), seed)
  if (!result.ok) throw new Error(result.message)
  return result.draw
}

describe('groups', () => {
  it('makes groups of 3 or 4, combined when the pairs do not split evenly', () => {
    expect(groupSizes(10, 4)).toEqual([3, 3, 4])
    expect(groupSizes(10, 3)).toEqual([3, 3, 4])
    expect(groupSizes(12, 4)).toEqual([4, 4, 4])
    expect(groupSizes(7, 4)).toEqual([3, 4])
    expect(groupSizes(9, 4)).toEqual([3, 3, 3])
    expect(groupSizes(8, 3)).toEqual([4, 4])
    expect(groupSizes(5, 4)).toEqual([5])
  })

  it('plays every pair of a group once', () => {
    expect(roundRobinPairs(4)).toEqual([[0, 3], [1, 2], [0, 2], [1, 3], [0, 1], [2, 3]])
    expect(roundRobinPairs(3)).toEqual([[1, 2], [0, 2], [0, 1]])
  })
})

describe('seeds', () => {
  it('puts the organizer\'s seeds first, then the lowest sum of categories, then the oldest sign-up', () => {
    const list = entries(5).map((entry) =>
      entry.id === 'e3' ? { ...entry, seed: 2 } : entry.id === 'e5' ? { ...entry, seed: 1 } : entry,
    )
    expect(seedOrder(list).map((entry) => entry.id)).toEqual(['e5', 'e3', 'e1', 'e2', 'e4'])
  })

  it('puts one seed in each group, in order', () => {
    expect(draw().groups.map((group) => group.entryIds[0])).toEqual(['e1', 'e2', 'e3'])
    const seeded = entries(10).map((entry) => (entry.id === 'e10' ? { ...entry, seed: 1 } : entry))
    expect(draw({ entries: seeded }).groups.map((group) => group.entryIds[0])).toEqual(['e10', 'e1', 'e2'])
  })
})

describe('drawCategory', () => {
  it('draws 10 pairs into groups of 3, 3 and 4 and a bracket of 8 with byes for the best firsts', () => {
    const result = draw()
    expect(result.groups.map((group) => [group.name, group.entryIds.length])).toEqual([
      ['Zona A', 3],
      ['Zona B', 3],
      ['Zona C', 4],
    ])
    expect(result.groups.flatMap((group) => group.entryIds).sort()).toEqual(entries(10).map((entry) => entry.id).sort())
    expect(result.matches.filter((match) => match.stage === 'group')).toHaveLength(12)
    const knockout = result.matches.filter((match) => match.stage === 'knockout')
    expect(knockout.map((match) => match.key)).toEqual(['K4-2', 'K4-4', 'K2-1', 'K2-2', 'K1-1'])
    expect(knockout.find((match) => match.key === 'K2-1')?.sourceA).toEqual({ group: 'A', place: 1 })
    expect(knockout.find((match) => match.key === 'K2-2')?.sourceA).toEqual({ group: 'B', place: 1 })
    for (const match of knockout.filter((item) => item.round === 4)) {
      const groupA = match.sourceA && 'group' in match.sourceA ? match.sourceA.group : null
      const groupB = match.sourceB && 'group' in match.sourceB ? match.sourceB.group : null
      expect(groupA).not.toBe(groupB)
    }
    expect(knockout.find((match) => match.key === 'K1-1')).toMatchObject({
      sourceA: { winnerOf: 'K2-1' },
      sourceB: { winnerOf: 'K2-2' },
    })
  })

  it('gives the same draw for the same seed, and a new one for another seed', () => {
    expect(draw({}, 7)).toEqual(draw({}, 7))
    const groupings = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seed) => JSON.stringify(draw({}, seed).groups)))
    expect(groupings.size).toBeGreaterThan(1)
  })

  it('draws a direct knockout with byes for the top seeds', () => {
    const result = draw({ format: 'knockout', entries: entries(6) })
    expect(result.groups).toEqual([])
    expect(result.matches.map((match) => match.key)).toEqual(['K4-2', 'K4-4', 'K2-1', 'K2-2', 'K1-1'])
    expect(result.matches.find((match) => match.key === 'K4-2')).toMatchObject({ entryA: 'e4', entryB: 'e5' })
    expect(result.matches.find((match) => match.key === 'K2-1')).toMatchObject({
      entryA: 'e1',
      sourceA: null,
      entryB: null,
      sourceB: { winnerOf: 'K4-2' },
    })
  })

  it('draws everyone against everyone in one group', () => {
    const result = draw({ format: 'round_robin', entries: entries(5) })
    expect(result.groups).toEqual([{ key: 'A', name: 'Zona única', entryIds: ['e1', 'e2', 'e3', 'e4', 'e5'] }])
    expect(result.matches).toHaveLength(10)
    expect(result.matches.every((match) => match.stage === 'group')).toBe(true)
  })

  it('plays a final between the 1st and the 2nd when there is only one group', () => {
    const result = draw({ entries: entries(4) })
    expect(result.groups).toHaveLength(1)
    expect(result.matches.filter((match) => match.stage === 'group')).toHaveLength(6)
    expect(result.matches.find((match) => match.stage === 'knockout')).toMatchObject({
      key: 'K1-1',
      round: 1,
      position: 1,
      sourceA: { group: 'A', place: 1 },
      sourceB: { group: 'A', place: 2 },
    })
  })

  it('needs 2 pairs', () => {
    expect(drawCategory(category({ entries: entries(1) }), 1)).toEqual({
      ok: false,
      message: 'Hacen falta al menos 2 parejas para sortear.',
    })
    expect(drawChampionship([category({ entries: entries(1) })], 1)).toEqual({
      ok: false,
      message: '6ta Libre: Hacen falta al menos 2 parejas para sortear.',
    })
  })
})

describe('bracketOrder', () => {
  it('keeps the top seeds apart until the end', () => {
    expect(bracketOrder(2)).toEqual([1, 2])
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
  })
})

describe('drawCategories and drawPayload', () => {
  it('draws the pairs with a place of the open categories', () => {
    const championship = makeChampionship({
      categories: [
        makeCategory({ entries: [makeEntry({ id: 'e1', seed: 1 }), makeEntry({ id: 'e2', status: 'waiting' })] }),
        makeCategory({ id: 'k2', name: '4ta', status: 'cancelled' }),
      ],
    })
    expect(drawCategories(championship)).toEqual([
      {
        id: 'k1',
        name: '6ta Libre',
        format: 'groups_knockout',
        groupSize: 4,
        qualifiers: 2,
        entries: [{ id: 'e1', level1: 5, level2: 6, seed: 1, createdAt: new Date('2026-10-06T12:00:00Z') }],
      },
    ])
  })

  it('sends the draw as save_championship_draw takes it', () => {
    const [payload] = drawPayload([draw({ entries: entries(4) })])
    expect(payload.category_id).toBe('k1')
    expect(payload.groups).toEqual([{ key: 'A', name: 'Zona A', entry_ids: ['e1', 'e2', 'e3', 'e4'] }])
    expect(payload.matches[0]).toEqual({
      key: 'A1',
      stage: 'group',
      group: 'A',
      round: null,
      position: null,
      entry_a: 'e1',
      entry_b: 'e4',
      source_a: null,
      source_b: null,
    })
    expect(payload.matches[6]).toEqual({
      key: 'K1-1',
      stage: 'knockout',
      group: null,
      round: 1,
      position: 1,
      entry_a: null,
      entry_b: null,
      source_a: { group: 'A', place: 1 },
      source_b: { group: 'A', place: 2 },
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/championship-draw.test.ts`
Expected: FAIL — `Cannot find module '@/lib/domain/championship-draw'`.

- [ ] **Step 3: Write minimal implementation**

`lib/domain/championship-draw.ts`:
```ts
import { activeEntries, openCategories, type CategoryFormat, type Championship } from './championships'

// The draw of a championship (design: "Sorteo"): groups of 3 or 4 by level with one seed each, and the bracket of
// the qualifiers (or of every pair, by direct knockout). Pure and deterministic: the same seed gives the same draw.
// A bye is no match: the seed that gets it goes straight into the next round. The Server Action sends the result
// to save_championship_draw, which checks it again.

export type DrawEntry = { id: string; level1: number; level2: number; seed: number | null; createdAt: Date }
export type DrawCategory = {
  id: string
  name: string
  format: CategoryFormat
  groupSize: number
  qualifiers: number
  entries: DrawEntry[]
}
export type DrawSource = { group: string; place: number } | { winnerOf: string }
export type DrawGroup = { key: string; name: string; entryIds: string[] }
export type DrawMatch = {
  key: string
  stage: 'group' | 'knockout'
  groupKey: string | null
  round: number | null
  position: number | null
  entryA: string | null
  entryB: string | null
  sourceA: DrawSource | null
  sourceB: DrawSource | null
}
export type CategoryDraw = { categoryId: string; groups: DrawGroup[]; matches: DrawMatch[] }
export type DrawResult = { ok: true; draw: CategoryDraw } | { ok: false; message: string }
export type ChampionshipDraw = { ok: true; draws: CategoryDraw[] } | { ok: false; message: string }

type Qualifier = { entryId: string | null; source: DrawSource | null; groupKey: string | null }
type Feeder = { match: string } | { qualifier: Qualifier }

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// A small PRNG (mulberry32): the same seed, the same numbers.
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashText(text: string): number {
  let hash = 2166136261
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items]
  for (let index = out.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[out[index], out[other]] = [out[other], out[index]]
  }
  return out
}

// Strongest first: the organizer's seeds (1 first), then the lowest sum of declared categories, then the oldest
// sign-up.
export function seedOrder<T extends DrawEntry>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    if (a.seed !== b.seed) {
      if (a.seed === null) return 1
      if (b.seed === null) return -1
      return a.seed - b.seed
    }
    return (
      a.level1 + a.level2 - (b.level1 + b.level2) ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id)
    )
  })
}

// Groups of 3 or 4 (the category's size), combined when the pairs do not split evenly (10 = 3 + 3 + 4); fewer
// than 6 pairs play in one group.
export function groupSizes(count: number, size: number): number[] {
  if (count < 6) return [count]
  if (size === 4) {
    const groups = Math.ceil(count / 4)
    const threes = groups * 4 - count
    return [...Array<number>(threes).fill(3), ...Array<number>(groups - threes).fill(4)]
  }
  const groups = Math.floor(count / 3)
  const fours = count - groups * 3
  return [...Array<number>(groups - fours).fill(3), ...Array<number>(fours).fill(4)]
}

// Every pair of a group once (circle method): [[0, 3], [1, 2], [0, 2], ...] by draw position.
export function roundRobinPairs(count: number): [number, number][] {
  const slots: (number | null)[] = Array.from({ length: count }, (_, index) => index)
  if (count % 2 === 1) slots.push(null)
  const size = slots.length
  const pairs: [number, number][] = []
  for (let round = 0; round < size - 1; round++) {
    for (let index = 0; index < size / 2; index++) {
      const a = slots[index]
      const b = slots[size - 1 - index]
      if (a !== null && b !== null) pairs.push(a < b ? [a, b] : [b, a])
    }
    slots.splice(1, 0, ...slots.splice(size - 1, 1))
  }
  return pairs
}

// The seeds of a bracket in the order of its first round: 1 against 8, 4 against 5... (1 and 2 meet in the final).
export function bracketOrder(size: number): number[] {
  let order = [1]
  while (order.length < size) {
    const next = order.length * 2 + 1
    order = order.flatMap((seed) => [seed, next - seed])
  }
  return order
}

// The seeds go one per group in order; the rest, by level in pots of one pair per open group, each pot shuffled
// with the seed and laid in a snake.
function assignGroups(ordered: DrawEntry[], sizes: number[], random: () => number): string[][] {
  const groups: string[][] = sizes.map(() => [])
  ordered.slice(0, sizes.length).forEach((entry, index) => groups[index].push(entry.id))
  let rest = ordered.slice(sizes.length)
  let forward = false
  while (rest.length > 0) {
    const open = sizes.map((_, index) => index).filter((index) => groups[index].length < sizes[index])
    const order = forward ? open : [...open].reverse()
    const pot = shuffle(rest.slice(0, order.length), random)
    pot.forEach((entry, index) => groups[order[index]].push(entry.id))
    rest = rest.slice(order.length)
    forward = !forward
  }
  return groups
}

function sameGroup(a: Qualifier, b: Qualifier): boolean {
  return a.groupKey !== null && a.groupKey === b.groupKey
}

// Two of the same group never meet in the first round: the lower seed swaps with another match's.
function avoidSameGroup(pairs: [number, number][], qualifiers: Qualifier[]): void {
  const count = qualifiers.length
  const at = (seed: number) => qualifiers[seed - 1]
  for (const pair of pairs) {
    if (pair[1] > count || !sameGroup(at(pair[0]), at(pair[1]))) continue
    const other = pairs.find(
      (candidate) =>
        candidate !== pair &&
        candidate[1] <= count &&
        !sameGroup(at(pair[0]), at(candidate[1])) &&
        !sameGroup(at(candidate[0]), at(pair[1])),
    )
    if (other) [pair[1], other[1]] = [other[1], pair[1]]
  }
}

function side(feeder: Feeder): { entry: string | null; source: DrawSource | null } {
  if ('match' in feeder) return { entry: null, source: { winnerOf: feeder.match } }
  return { entry: feeder.qualifier.entryId, source: feeder.qualifier.source }
}

function knockoutMatch(round: number, position: number, a: Feeder, b: Feeder): DrawMatch {
  const sideA = side(a)
  const sideB = side(b)
  return {
    key: `K${round}-${position}`,
    stage: 'knockout',
    groupKey: null,
    round,
    position,
    entryA: sideA.entry,
    entryB: sideB.entry,
    sourceA: sideA.source,
    sourceB: sideB.source,
  }
}

// The bracket of the power of 2 that holds the qualifiers (in seed order); a bye sends its seed to the next round.
function buildBracket(qualifiers: Qualifier[]): DrawMatch[] {
  const count = qualifiers.length
  if (count < 2) return []
  let size = 2
  while (size < count) size *= 2
  const order = bracketOrder(size)
  const pairs: [number, number][] = []
  for (let index = 0; index < size; index += 2) pairs.push([order[index], order[index + 1]])
  avoidSameGroup(pairs, qualifiers)
  const matches: DrawMatch[] = []
  const firstRound = size / 2
  let feeders: Feeder[] = pairs.map(([a, b], index) => {
    const first: Feeder = { qualifier: qualifiers[a - 1] }
    if (b > count) return first
    const match = knockoutMatch(firstRound, index + 1, first, { qualifier: qualifiers[b - 1] })
    matches.push(match)
    return { match: match.key }
  })
  for (let round = firstRound / 2; round >= 1; round /= 2) {
    const next: Feeder[] = []
    for (let position = 1; position <= round; position++) {
      const match = knockoutMatch(round, position, feeders[2 * position - 2], feeders[2 * position - 1])
      matches.push(match)
      next.push({ match: match.key })
    }
    feeders = next
  }
  return matches
}

export function drawCategory(category: DrawCategory, seed: number): DrawResult {
  if (category.entries.length < 2) return { ok: false, message: 'Hacen falta al menos 2 parejas para sortear.' }
  const ordered = seedOrder(category.entries)
  if (category.format === 'knockout') {
    const qualifiers = ordered.map((entry) => ({ entryId: entry.id, source: null, groupKey: null }))
    return { ok: true, draw: { categoryId: category.id, groups: [], matches: buildBracket(qualifiers) } }
  }
  const sizes = category.format === 'round_robin' ? [ordered.length] : groupSizes(ordered.length, category.groupSize)
  const random = seededRandom((seed ^ hashText(category.id)) >>> 0)
  const groups: DrawGroup[] = assignGroups(ordered, sizes, random).map((entryIds, index) => ({
    key: LETTERS[index],
    name: category.format === 'round_robin' ? 'Zona única' : `Zona ${LETTERS[index]}`,
    entryIds,
  }))
  const matches: DrawMatch[] = groups.flatMap((group) =>
    roundRobinPairs(group.entryIds.length).map(([a, b], index) => ({
      key: `${group.key}${index + 1}`,
      stage: 'group' as const,
      groupKey: group.key,
      round: null,
      position: null,
      entryA: group.entryIds[a],
      entryB: group.entryIds[b],
      sourceA: null,
      sourceB: null,
    })),
  )
  if (category.format === 'groups_knockout') {
    // Every group's 1st (A, B, ...), then every 2nd...; never more than a group's size minus one.
    const qualifiers: Qualifier[] = []
    for (let place = 1; place <= category.qualifiers; place++) {
      for (const group of groups) {
        if (place < group.entryIds.length) {
          qualifiers.push({ entryId: null, source: { group: group.key, place }, groupKey: group.key })
        }
      }
    }
    matches.push(...buildBracket(qualifiers))
  }
  return { ok: true, draw: { categoryId: category.id, groups, matches } }
}

export function drawChampionship(categories: DrawCategory[], seed: number): ChampionshipDraw {
  const draws: CategoryDraw[] = []
  for (const category of categories) {
    const result = drawCategory(category, seed)
    if (!result.ok) return { ok: false, message: `${category.name}: ${result.message}` }
    draws.push(result.draw)
  }
  return { ok: true, draws }
}

// The open categories with their pairs with a place.
export function drawCategories(championship: Pick<Championship, 'categories'>): DrawCategory[] {
  return openCategories(championship).map((category) => ({
    id: category.id,
    name: category.name,
    format: category.format,
    groupSize: category.groupSize,
    qualifiers: category.qualifiers,
    entries: activeEntries(category).map((entry) => ({
      id: entry.id,
      level1: entry.level1,
      level2: entry.level2,
      seed: entry.seed,
      createdAt: entry.createdAt,
    })),
  }))
}

function sourcePayload(source: DrawSource | null) {
  if (!source) return null
  return 'winnerOf' in source ? { winner_of: source.winnerOf } : { group: source.group, place: source.place }
}

// What save_championship_draw takes.
export function drawPayload(draws: CategoryDraw[]) {
  return draws.map((draw) => ({
    category_id: draw.categoryId,
    groups: draw.groups.map((group) => ({ key: group.key, name: group.name, entry_ids: group.entryIds })),
    matches: draw.matches.map((match) => ({
      key: match.key,
      stage: match.stage,
      group: match.groupKey,
      round: match.round,
      position: match.position,
      entry_a: match.entryA,
      entry_b: match.entryB,
      source_a: sourcePayload(match.sourceA),
      source_b: sourcePayload(match.sourceB),
    })),
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/championship-draw.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/championship-draw.ts tests/unit/lib/domain/championship-draw.test.ts
git commit -m "feat: championship draw (groups, seeds, snake and bracket)"
```

---

### Task 12: Los resultados (`lib/domain/championship-results.ts`)

**Files:**
- Create: `lib/domain/championship-results.ts`
- Test: `tests/unit/lib/domain/championship-results.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/domain/championship-results.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { checkResult, setDone, setPartial, walkoverSets, type MatchRules } from '@/lib/domain/championship-results'

const SUPER: MatchRules = { thirdSet: 'super_tiebreak', timeLimit: null }
const FULL: MatchRules = { thirdSet: 'full', timeLimit: null }
const LIMIT: MatchRules = { thirdSet: 'super_tiebreak', timeLimit: 50 }

describe('sets', () => {
  it('ends a set 6-0 to 6-4, 7-5 or 7-6', () => {
    expect(setDone(6, 4, false)).toBe(true)
    expect(setDone(7, 5, false)).toBe(true)
    expect(setDone(6, 7, false)).toBe(true)
    expect(setDone(6, 5, false)).toBe(false)
    expect(setDone(7, 4, false)).toBe(false)
  })

  it('ends a super tie-break at 10 by 2', () => {
    expect(setDone(10, 8, true)).toBe(true)
    expect(setDone(12, 10, true)).toBe(true)
    expect(setDone(10, 9, true)).toBe(false)
    expect(setDone(12, 9, true)).toBe(false)
  })

  it('knows a set the time cut', () => {
    expect(setPartial(6, 5, false)).toBe(true)
    expect(setPartial(3, 3, false)).toBe(true)
    expect(setPartial(6, 4, false)).toBe(false)
    expect(setPartial(9, 8, true)).toBe(true)
    expect(setPartial(12, 9, true)).toBe(false)
  })
})

describe('checkResult', () => {
  it('rejects 6-5 and a tie-break without 2 of difference', () => {
    expect(checkResult([[6, 5], [6, 4]], SUPER)).toEqual({
      ok: false,
      message: 'El set 1 no es un resultado posible: termina 6-0 a 6-4, 7-5 o 7-6.',
    })
    expect(checkResult([[6, 4], [3, 6], [10, 9]], SUPER)).toEqual({
      ok: false,
      message: 'El súper tie-break termina a 10 con 2 de diferencia (10-8, 11-9…).',
    })
  })

  it('accepts a match won in the super tie-break, or in a full third set', () => {
    expect(checkResult([[6, 4], [3, 6], [10, 8]], SUPER)).toEqual({ ok: true, winner: 'a' })
    expect(checkResult([[4, 6], [6, 3], [5, 7]], FULL)).toEqual({ ok: true, winner: 'b' })
    expect(checkResult([[6, 2], [6, 1]], SUPER)).toEqual({ ok: true, winner: 'a' })
  })

  it('needs somebody to win 2 sets without a time limit, and no set after that', () => {
    expect(checkResult([[6, 4], [3, 6]], SUPER)).toEqual({
      ok: false,
      message: 'Falta terminar el partido: alguien tiene que ganar 2 sets.',
    })
    expect(checkResult([[6, 4], [6, 3], [6, 2]], SUPER)).toEqual({
      ok: false,
      message: 'Sobra un set: el partido ya estaba ganado.',
    })
    expect(checkResult([], SUPER)).toEqual({ ok: false, message: 'Cargá al menos un set.' })
  })

  it('takes the score as it was when the time ran out: sets first, then games', () => {
    expect(checkResult([[6, 4], [3, 3]], LIMIT)).toEqual({ ok: true, winner: 'a' })
    expect(checkResult([[4, 5]], LIMIT)).toEqual({ ok: true, winner: 'b' })
    expect(checkResult([[6, 2], [4, 6], [5, 3]], LIMIT)).toEqual({ ok: true, winner: 'a' })
    expect(checkResult([[4, 4]], LIMIT)).toEqual({
      ok: false,
      message: 'Empate: con límite de tiempo gana quien va arriba en sets y después en games.',
    })
  })

  it('counts a W.O. as 6-0 6-0', () => {
    expect(walkoverSets('a')).toEqual([[6, 0], [6, 0]])
    expect(walkoverSets('b')).toEqual([[0, 6], [0, 6]])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/championship-results.test.ts`
Expected: FAIL — `Cannot find module '@/lib/domain/championship-results'`.

- [ ] **Step 3: Write minimal implementation**

`lib/domain/championship-results.ts`:
```ts
import type { ThirdSet } from './championships'

// The result of a championship match (design: "Día del torneo"), with the same rules as private.match_winner: a
// set ends 6-0 to 6-4, 7-5 or 7-6 (tie-break at 6-6); the third set is a super tie-break to 10 by 2, or a full
// set. With a time limit the last set may stay as it was and the leader in sets, then in games, wins (a super
// tie-break counts as one game); a draw is no result.

export type MatchRules = { thirdSet: ThirdSet; timeLimit: number | null }
export type Score = [number, number]
export type ResultCheck = { ok: true; winner: 'a' | 'b' } | { ok: false; message: string }

export function setDone(a: number, b: number, superTiebreak: boolean): boolean {
  const high = Math.max(a, b)
  const low = Math.min(a, b)
  if (superTiebreak) return high >= 10 && high - low >= 2 && (high === 10 || high - low === 2)
  return (high === 6 && low <= 4) || (high === 7 && (low === 5 || low === 6))
}

// A set the time cut: not over, and still possible.
export function setPartial(a: number, b: number, superTiebreak: boolean): boolean {
  if (setDone(a, b, superTiebreak)) return false
  return superTiebreak ? Math.max(a, b) < 10 || Math.abs(a - b) <= 1 : a <= 6 && b <= 6
}

export function checkResult(sets: Score[], rules: MatchRules): ResultCheck {
  if (sets.length === 0) return { ok: false, message: 'Cargá al menos un set.' }
  if (sets.length > 3) return { ok: false, message: 'Un partido tiene como mucho 3 sets.' }
  let wonA = 0
  let wonB = 0
  let gamesA = 0
  let gamesB = 0
  for (const [index, [a, b]] of sets.entries()) {
    if (![a, b].every((games) => Number.isInteger(games) && games >= 0 && games <= 99)) {
      return { ok: false, message: 'Los games son números de 0 a 99.' }
    }
    if (wonA === 2 || wonB === 2) return { ok: false, message: 'Sobra un set: el partido ya estaba ganado.' }
    const superTiebreak = index === 2 && rules.thirdSet === 'super_tiebreak'
    if (setDone(a, b, superTiebreak)) {
      if (a > b) {
        wonA++
      } else {
        wonB++
      }
    } else if (!(index === sets.length - 1 && rules.timeLimit !== null && setPartial(a, b, superTiebreak))) {
      return {
        ok: false,
        message: superTiebreak
          ? 'El súper tie-break termina a 10 con 2 de diferencia (10-8, 11-9…).'
          : `El set ${index + 1} no es un resultado posible: termina 6-0 a 6-4, 7-5 o 7-6.`,
      }
    }
    if (superTiebreak) {
      gamesA += a > b ? 1 : 0
      gamesB += b > a ? 1 : 0
    } else {
      gamesA += a
      gamesB += b
    }
  }
  if (rules.timeLimit === null && Math.max(wonA, wonB) < 2) {
    return { ok: false, message: 'Falta terminar el partido: alguien tiene que ganar 2 sets.' }
  }
  if (wonA !== wonB) return { ok: true, winner: wonA > wonB ? 'a' : 'b' }
  if (gamesA !== gamesB) return { ok: true, winner: gamesA > gamesB ? 'a' : 'b' }
  return { ok: false, message: 'Empate: con límite de tiempo gana quien va arriba en sets y después en games.' }
}

// How record_walkover stores a W.O.: 6-0 6-0 for the pair that showed up.
export function walkoverSets(winner: 'a' | 'b'): Score[] {
  return winner === 'a' ? [[6, 0], [6, 0]] : [[0, 6], [0, 6]]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/championship-results.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/championship-results.ts tests/unit/lib/domain/championship-results.test.ts
git commit -m "feat: championship match results checked by the category's rules"
```

---

### Task 13: La tabla de zona (`lib/domain/championship-standings.ts`)

**Files:**
- Create: `lib/domain/championship-standings.ts`
- Test: `tests/unit/lib/domain/championship-standings.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/domain/championship-standings.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { blockingTies, closingOrder, decisivePlaces, groupStandings } from '@/lib/domain/championship-standings'
import { makeGroup, makeMatch, members, played, set } from '../../fixtures/championship-fixture'

const FOUR = makeGroup({ members: members(['e1', 'e2', 'e3', 'e4']) })
const ids = (rows: { entryId: string }[]) => rows.map((row) => row.entryId)

describe('groupStandings', () => {
  it('orders by matches won and counts sets and games', () => {
    const matches = [
      played('m1', 'e1', 'e2', 'a'),
      played('m2', 'e3', 'e4', 'a'),
      played('m3', 'e1', 'e3', 'a'),
      played('m4', 'e2', 'e4', 'a'),
      played('m5', 'e1', 'e4', 'a'),
      played('m6', 'e2', 'e3', 'a'),
    ]
    const standings = groupStandings(FOUR, matches)
    expect(ids(standings.rows)).toEqual(['e1', 'e2', 'e3', 'e4'])
    expect(standings.rows[0]).toEqual({
      entryId: 'e1',
      played: 3,
      won: 3,
      lost: 0,
      setsWon: 6,
      setsLost: 0,
      gamesWon: 36,
      gamesLost: 18,
    })
    expect(standings.complete).toBe(true)
    expect(standings.tied).toEqual([])
  })

  it('breaks a tie of two by the match between them', () => {
    const matches = [
      played('m1', 'e1', 'e2', 'b', [set(4, 6), set(4, 6)]),
      played('m2', 'e1', 'e3', 'a', [set(6, 0), set(6, 0)]),
      played('m3', 'e1', 'e4', 'a', [set(6, 0), set(6, 0)]),
      played('m4', 'e2', 'e3', 'b', [set(3, 6), set(3, 6)]),
      played('m5', 'e2', 'e4', 'a', [set(7, 6), set(7, 6)]),
      played('m6', 'e3', 'e4', 'b', [set(4, 6), set(4, 6)]),
    ]
    expect(ids(groupStandings(FOUR, matches).rows)).toEqual(['e2', 'e1', 'e4', 'e3'])
  })

  it('breaks a tie of three by set difference, then game difference', () => {
    const matches = [
      played('m1', 'e1', 'e2', 'a', [set(6, 0), set(6, 0)]),
      played('m2', 'e2', 'e3', 'a', [set(6, 4), set(6, 4)]),
      played('m3', 'e1', 'e3', 'b', [set(6, 7), set(6, 7)]),
      played('m4', 'e1', 'e4', 'a'),
      played('m5', 'e2', 'e4', 'a'),
      played('m6', 'e3', 'e4', 'a'),
    ]
    expect(ids(groupStandings(FOUR, matches).rows)).toEqual(['e1', 'e3', 'e2', 'e4'])
  })

  it('leaves to the organizer what is still level', () => {
    const three = makeGroup({ members: members(['e1', 'e2', 'e3']) })
    const matches = [played('m1', 'e1', 'e2', 'a'), played('m2', 'e2', 'e3', 'a'), played('m3', 'e3', 'e1', 'a')]
    const standings = groupStandings(three, matches)
    expect(standings.tied).toEqual([['e1', 'e2', 'e3']])
    expect(closingOrder(three, matches, 1)).toEqual({ ok: false, reason: 'tied', tied: [['e1', 'e2', 'e3']] })
  })

  it('only stops for a tie that decides a place', () => {
    const matches = [
      played('m1', 'e1', 'e2', 'a'),
      played('m2', 'e1', 'e3', 'a'),
      played('m3', 'e1', 'e4', 'a'),
      played('m4', 'e2', 'e3', 'a'),
      played('m5', 'e3', 'e4', 'a'),
      played('m6', 'e4', 'e2', 'a'),
    ]
    const standings = groupStandings(FOUR, matches)
    expect(standings.tied).toEqual([['e2', 'e3', 'e4']])
    expect(blockingTies(standings, 1)).toEqual([])
    expect(blockingTies(standings, 2)).toEqual([['e2', 'e3', 'e4']])
    expect(closingOrder(FOUR, matches, 1)).toEqual({ ok: true, order: ['e1', 'e2', 'e3', 'e4'] })
  })

  it('counts a W.O. as 6-0 6-0 and a super tie-break as one game', () => {
    const two = makeGroup({ members: members(['e1', 'e2']) })
    const walkover = makeMatch({ status: 'walkover', winner: 'e1', absent: 'e2', sets: [set(6, 0), set(6, 0)] })
    expect(groupStandings(two, [walkover]).rows[0]).toMatchObject({ entryId: 'e1', won: 1, gamesWon: 12, gamesLost: 0 })
    const superTiebreak = played('m1', 'e1', 'e2', 'a', [set(6, 4), set(4, 6), set(10, 8, true)])
    expect(groupStandings(two, [superTiebreak]).rows[0]).toMatchObject({
      setsWon: 2,
      setsLost: 1,
      gamesWon: 11,
      gamesLost: 10,
    })
  })

  it('does not close a group with matches to play', () => {
    const matches = [played('m1', 'e1', 'e2', 'a'), makeMatch({ id: 'm2', entryA: 'e3', entryB: 'e4' })]
    expect(closingOrder(FOUR, matches, 2)).toEqual({ ok: false, reason: 'incomplete', tied: [] })
  })
})

describe('decisivePlaces', () => {
  it('counts the qualifiers, or every place when everyone plays everyone', () => {
    expect(decisivePlaces({ format: 'groups_knockout', qualifiers: 2 }, 4)).toBe(2)
    expect(decisivePlaces({ format: 'groups_knockout', qualifiers: 2 }, 2)).toBe(1)
    expect(decisivePlaces({ format: 'round_robin', qualifiers: 2 }, 5)).toBe(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/championship-standings.test.ts`
Expected: FAIL — `Cannot find module '@/lib/domain/championship-standings'`.

- [ ] **Step 3: Write minimal implementation**

`lib/domain/championship-standings.ts`:
```ts
import { isDone, type FixtureGroup, type FixtureMatch, type MatchSet } from './championship-fixture'
import type { CategoryFormat } from './championships'

// A group's table (design: "Desempate de zona"): matches won; between two level pairs, the match between them;
// then set difference and game difference. What is still level is the organizer's (a draw from the app). A W.O.
// counts 6-0 6-0 (record_walkover stores it so) and a super tie-break one game.

export type StandingRow = {
  entryId: string
  played: number
  won: number
  lost: number
  setsWon: number
  setsLost: number
  gamesWon: number
  gamesLost: number
}
export type GroupStandings = { rows: StandingRow[]; complete: boolean; tied: string[][] }
export type ClosingOrder = { ok: true; order: string[] } | { ok: false; reason: 'incomplete' | 'tied'; tied: string[][] }

const setDiff = (row: StandingRow) => row.setsWon - row.setsLost
const gameDiff = (row: StandingRow) => row.gamesWon - row.gamesLost

function count(row: StandingRow, sets: MatchSet[], side: 'a' | 'b'): void {
  for (const item of sets) {
    const own = side === 'a' ? item.a : item.b
    const other = side === 'a' ? item.b : item.a
    if (own > other) row.setsWon++
    else if (other > own) row.setsLost++
    if (item.superTiebreak) {
      if (own > other) row.gamesWon++
      else if (other > own) row.gamesLost++
    } else {
      row.gamesWon += own
      row.gamesLost += other
    }
  }
}

function headToHead(a: string, b: string, matches: FixtureMatch[]): string | null {
  const match = matches.find(
    (item) => isDone(item) && ((item.entryA === a && item.entryB === b) || (item.entryA === b && item.entryB === a)),
  )
  return match?.winner ?? null
}

function breakTie(level: StandingRow[], matches: FixtureMatch[], tied: string[][]): StandingRow[] {
  if (level.length === 1) return level
  if (level.length === 2) {
    const winner = headToHead(level[0].entryId, level[1].entryId, matches)
    if (winner === level[0].entryId) return level
    if (winner === level[1].entryId) return [level[1], level[0]]
  }
  const sorted = [...level].sort((a, b) => setDiff(b) - setDiff(a) || gameDiff(b) - gameDiff(a))
  const out: StandingRow[] = []
  let start = 0
  while (start < sorted.length) {
    let end = start + 1
    while (
      end < sorted.length &&
      setDiff(sorted[end]) === setDiff(sorted[start]) &&
      gameDiff(sorted[end]) === gameDiff(sorted[start])
    ) {
      end++
    }
    const still = sorted.slice(start, end)
    const winner = still.length === 2 && level.length > 2 ? headToHead(still[0].entryId, still[1].entryId, matches) : null
    if (winner) {
      out.push(...(winner === still[0].entryId ? still : [still[1], still[0]]))
    } else {
      if (still.length > 1) tied.push(still.map((row) => row.entryId))
      out.push(...still)
    }
    start = end
  }
  return out
}

export function groupStandings(group: FixtureGroup, matches: FixtureMatch[]): GroupStandings {
  const own = matches.filter((match) => match.groupId === group.id)
  const rows = new Map(
    group.members.map((member) => [
      member.entryId,
      { entryId: member.entryId, played: 0, won: 0, lost: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 },
    ]),
  )
  for (const match of own) {
    if (!isDone(match) || !match.entryA || !match.entryB) continue
    const a = rows.get(match.entryA)
    const b = rows.get(match.entryB)
    if (!a || !b) continue
    a.played++
    b.played++
    if (match.winner === match.entryA) {
      a.won++
      b.lost++
    } else if (match.winner === match.entryB) {
      b.won++
      a.lost++
    }
    count(a, match.sets, 'a')
    count(b, match.sets, 'b')
  }
  // Level on wins, in draw order (stable sorts keep it).
  const byWins = new Map<number, StandingRow[]>()
  for (const row of rows.values()) byWins.set(row.won, [...(byWins.get(row.won) ?? []), row])
  const tied: string[][] = []
  const ordered = [...byWins.entries()]
    .sort((a, b) => b[0] - a[0])
    .flatMap(([, level]) => breakTie(level, own, tied))
  return { rows: ordered, complete: own.length > 0 && own.every(isDone), tied }
}

// The places that send a pair on: the qualifiers (never more than the group's size minus one), or every place when
// everyone plays everyone (the 1st is the champion).
export function decisivePlaces(category: { format: CategoryFormat; qualifiers: number }, groupSize: number): number {
  return category.format === 'round_robin' ? groupSize : Math.min(category.qualifiers, groupSize - 1)
}

// The ties that touch one of those places.
export function blockingTies(standings: GroupStandings, places: number): string[][] {
  return standings.tied.filter((level) =>
    level.some((entryId) => standings.rows.findIndex((row) => row.entryId === entryId) < places),
  )
}

// The order close_championship_group takes, when the group is complete and nothing level decides a place.
export function closingOrder(group: FixtureGroup, matches: FixtureMatch[], places: number): ClosingOrder {
  const standings = groupStandings(group, matches)
  if (!standings.complete) return { ok: false, reason: 'incomplete', tied: [] }
  const tied = blockingTies(standings, places)
  if (tied.length > 0) return { ok: false, reason: 'tied', tied }
  return { ok: true, order: standings.rows.map((row) => row.entryId) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/championship-standings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/championship-standings.ts tests/unit/lib/domain/championship-standings.test.ts
git commit -m "feat: group tables with their tie-breaks"
```

---

### Task 14: El programador (`lib/domain/championship-schedule.ts`)

**Files:**
- Create: `lib/domain/championship-schedule.ts`
- Test: `tests/unit/lib/domain/championship-schedule.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/domain/championship-schedule.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { drawCategory, type CategoryDraw, type DrawEntry, type DrawSource } from '@/lib/domain/championship-draw'
import type { MatchSource } from '@/lib/domain/championship-fixture'
import {
  applySchedule,
  checkSchedule,
  scheduleChampionship,
  scheduleInput,
  schedulePayload,
  slotOptions,
  unplacedReasons,
  type ScheduledSlot,
  type ScheduleEntry,
  type ScheduleInput,
  type ScheduleMatch,
} from '@/lib/domain/championship-schedule'
import type { CategoryFormat, ChampionshipWindow } from '@/lib/domain/championships'
import { localDateOf, minutesOfDay, zonedTime } from '@/lib/domain/time'
import { makeCategory, makeChampionship, makeEntry } from '../../fixtures/championships'
import { makeMatch } from '../../fixtures/championship-fixture'

const TIMEZONE = 'America/Montevideo'
const DAY = '2026-10-17'

function window(date: string, fromTime: string, toTime: string, courtIds: string[]): ChampionshipWindow {
  return { id: `w-${date}`, date, fromTime, toTime, courtIds }
}

function pair(id: string, playerIds: string[], unavailable: string[] = []): ScheduleEntry {
  return { id, name: `Pareja ${id}`, playerIds, unavailable }
}

// A category drawn with seed 1: its pairs in this order are already strongest first.
function drawn(categoryId: string, format: CategoryFormat, entryIds: string[]): CategoryDraw {
  const entries: DrawEntry[] = entryIds.map((id, index) => ({
    id,
    level1: 5,
    level2: 5,
    seed: null,
    createdAt: new Date(Date.UTC(2026, 9, 1, 12, index)),
  }))
  const result = drawCategory({ id: categoryId, name: categoryId, format, groupSize: 4, qualifiers: 2, entries }, 1)
  if (!result.ok) throw new Error(result.message)
  return result.draw
}

// The matches of a draw as the scheduler takes them: ids '<category>:<key>', groups '<category>:<group>'.
function scheduleMatches(draw: CategoryDraw, minutes: number): ScheduleMatch[] {
  const id = (key: string) => `${draw.categoryId}:${key}`
  const source = (value: DrawSource | null): MatchSource | null => {
    if (value === null) return null
    return 'winnerOf' in value
      ? { kind: 'winner', matchId: id(value.winnerOf) }
      : { kind: 'group', groupId: id(value.group), place: value.place }
  }
  return draw.matches.map((match) => ({
    id: id(match.key),
    categoryId: draw.categoryId,
    minutes,
    stage: match.stage,
    groupId: match.groupKey ? id(match.groupKey) : null,
    round: match.round,
    position: match.position,
    entryA: match.entryA,
    entryB: match.entryB,
    sourceA: source(match.sourceA),
    sourceB: source(match.sourceB),
    pinned: false,
    courtId: null,
    startsAt: null,
  }))
}

// Four pairs in one group and a final, on Saturday from 08:00 to 20:00 on two courts.
function smallInput(): ScheduleInput {
  return {
    timezone: TIMEZONE,
    windows: [window(DAY, '08:00', '20:00', ['court-1', 'court-2'])],
    entries: ['e1', 'e2', 'e3', 'e4'].map((id, index) => pair(id, [`p${index}a`, `p${index}b`])),
    matches: scheduleMatches(drawn('k1', 'groups_knockout', ['e1', 'e2', 'e3', 'e4']), 90),
  }
}

function slotOf(slots: ScheduledSlot[], matchId: string): ScheduledSlot {
  const slot = slots.find((item) => item.matchId === matchId)
  if (!slot) throw new Error(`${matchId} has no slot`)
  return slot
}

function expectOneMatchPerCourt(slots: ScheduledSlot[]): void {
  const byCourt = new Map<string, ScheduledSlot[]>()
  for (const slot of slots) byCourt.set(slot.courtId, [...(byCourt.get(slot.courtId) ?? []), slot])
  for (const list of byCourt.values()) {
    const sorted = [...list].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    for (let index = 1; index < sorted.length; index++) {
      expect(sorted[index].startsAt.getTime()).toBeGreaterThanOrEqual(sorted[index - 1].endsAt.getTime())
    }
  }
}

describe('scheduleChampionship', () => {
  it('places every match keeping the rules, the final at the end of the last day', () => {
    const input = smallInput()
    const result = scheduleChampionship(input)
    expect(result.unplaced).toEqual([])
    expect(result.slots).toHaveLength(7)
    expect(checkSchedule(applySchedule(input, result))).toEqual([])
    expectOneMatchPerCourt(result.slots)
    const final = slotOf(result.slots, 'k1:K1-1')
    expect(localDateOf(final.startsAt, TIMEZONE)).toBe(DAY)
    expect(minutesOfDay(final.startsAt, TIMEZONE)).toBe(18 * 60 + 30)
    const lastGroupEnd = Math.max(
      ...result.slots.filter((slot) => slot.matchId !== 'k1:K1-1').map((slot) => slot.endsAt.getTime()),
    )
    expect(final.startsAt.getTime()).toBeGreaterThanOrEqual(lastGroupEnd + 45 * 60_000)
  })

  it('never puts a player of two categories in two places at once, and rests every pair 45 minutes', () => {
    const input: ScheduleInput = {
      timezone: TIMEZONE,
      windows: [window(DAY, '08:00', '23:00', ['court-1', 'court-2'])],
      entries: [
        pair('e1', ['ana', 'pedro']),
        pair('e2', ['bruno', 'lucia']),
        pair('e3', ['gabi', 'marta']),
        pair('e4', ['ana', 'raul']),
        pair('e5', ['ivan', 'olga']),
        pair('e6', ['juli', 'nico']),
      ],
      matches: [
        ...scheduleMatches(drawn('k1', 'round_robin', ['e1', 'e2', 'e3']), 90),
        ...scheduleMatches(drawn('k2', 'round_robin', ['e4', 'e5', 'e6']), 90),
      ],
    }
    const result = scheduleChampionship(input)
    expect(result.unplaced).toEqual([])
    const playing = (entryIds: string[]) =>
      result.slots
        .filter((slot) => {
          const match = input.matches.find((item) => item.id === slot.matchId)
          return entryIds.some((entryId) => entryId === match?.entryA || entryId === match?.entryB)
        })
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    const ana = playing(['e1', 'e4'])
    expect(ana).toHaveLength(4)
    for (let index = 1; index < ana.length; index++) {
      expect(ana[index].startsAt.getTime()).toBeGreaterThanOrEqual(ana[index - 1].endsAt.getTime())
    }
    for (const entryId of ['e1', 'e2', 'e3', 'e4', 'e5', 'e6']) {
      const own = playing([entryId])
      for (let index = 1; index < own.length; index++) {
        expect(own[index].startsAt.getTime() - own[index - 1].endsAt.getTime()).toBeGreaterThanOrEqual(45 * 60_000)
      }
    }
  })

  it('leaves a pinned match where it is', () => {
    const input = smallInput()
    const pinnedAt = zonedTime(DAY, 8 * 60, TIMEZONE)
    input.matches = input.matches.map((match) =>
      match.id === 'k1:A6' ? { ...match, pinned: true, courtId: 'court-2', startsAt: pinnedAt } : match,
    )
    const result = scheduleChampionship(input)
    expect(result.slots.some((slot) => slot.matchId === 'k1:A6')).toBe(false)
    const applied = applySchedule(input, result)
    expect(applied.matches.find((match) => match.id === 'k1:A6')).toMatchObject({ courtId: 'court-2', startsAt: pinnedAt })
    expect(checkSchedule(applied)).toEqual([])
  })

  it('lists what it could not place, with the reason', () => {
    const input: ScheduleInput = {
      timezone: TIMEZONE,
      windows: [window(DAY, '08:00', '12:00', ['court-1'])],
      entries: [{ ...pair('e1', ['ana', 'pedro'], [`${DAY}@08:00`, `${DAY}@10:00`]), name: 'Ana y Pedro' }, pair('e2', ['bruno', 'lucia'])],
      matches: scheduleMatches(drawn('k1', 'round_robin', ['e1', 'e2']), 90),
    }
    const result = scheduleChampionship(input)
    expect(result.slots).toEqual([])
    expect(result.unplaced).toEqual([
      { matchId: 'k1:A1', reason: 'Ana y Pedro no tiene horario disponible en los días de juego.' },
    ])
    expect(unplacedReasons(applySchedule(input, result))).toEqual(result.unplaced)
  })

  it('places the spec case (8 categories of 12 pairs, 3 days, 3 courts) keeping every hard rule', () => {
    const days = ['2026-10-16', '2026-10-17', '2026-10-18']
    const courts = ['court-1', 'court-2', 'court-3']
    const entries: ScheduleEntry[] = []
    const matches: ScheduleMatch[] = []
    for (let category = 0; category < 8; category++) {
      const entryIds = Array.from({ length: 12 }, (_, index) => `k${category}-e${index}`)
      entryIds.forEach((id, index) => {
        // The first pair of each category but the first has a player of the second pair of the category before.
        const first = category > 0 && index === 0 ? `k${category - 1}-p1a` : `k${category}-p${index}a`
        entries.push(pair(id, [first, `k${category}-p${index}b`]))
      })
      matches.push(...scheduleMatches(drawn(`k${category}`, 'groups_knockout', entryIds), category % 2 === 0 ? 90 : 60))
    }
    const input: ScheduleInput = {
      timezone: TIMEZONE,
      windows: days.map((date) => window(date, '08:00', '23:00', courts)),
      entries,
      matches,
    }
    expect(matches).toHaveLength(184)
    const result = scheduleChampionship(input)
    expect(result.slots.length + result.unplaced.length).toBe(184)
    expect(result.unplaced.length).toBeGreaterThan(0)
    expect(result.unplaced.every((item) => item.reason.length > 0)).toBe(true)
    expect(checkSchedule(applySchedule(input, result))).toEqual([])
    expectOneMatchPerCourt(result.slots)
    for (const slot of result.slots) {
      expect(days).toContain(localDateOf(slot.startsAt, TIMEZONE))
      expect(minutesOfDay(slot.startsAt, TIMEZONE)).toBeGreaterThanOrEqual(8 * 60)
      expect(minutesOfDay(slot.endsAt, TIMEZONE)).toBeLessThanOrEqual(23 * 60)
    }
  })
})

describe('slotOptions', () => {
  it('offers the other courts and starts where the match fits', () => {
    const at = (minutes: number) => zonedTime(DAY, minutes, TIMEZONE)
    const [first] = scheduleMatches(drawn('k1', 'round_robin', ['e1', 'e2']), 90)
    const [second] = scheduleMatches(drawn('k2', 'round_robin', ['e3', 'e4']), 90)
    const input: ScheduleInput = {
      timezone: TIMEZONE,
      windows: [window(DAY, '08:00', '11:00', ['court-1', 'court-2'])],
      entries: [pair('e1', ['ana', 'pedro']), pair('e2', ['bruno', 'lucia']), pair('e3', ['gabi', 'marta']), pair('e4', ['hugo', 'nico'])],
      matches: [
        { ...first, courtId: 'court-1', startsAt: at(8 * 60) },
        { ...second, courtId: 'court-2', startsAt: at(8 * 60) },
      ],
    }
    expect(slotOptions(input, 'k1:A1')).toEqual([
      { courtId: 'court-1', startsAt: at(9 * 60 + 30) },
      { courtId: 'court-2', startsAt: at(9 * 60 + 30) },
    ])
  })
})

describe('scheduleInput and schedulePayload', () => {
  it('builds the input from a championship and its fixture', () => {
    const championship = makeChampionship({
      categories: [
        makeCategory({
          matchMinutes: 60,
          entries: [makeEntry({ id: 'e1', unavailable: ['2026-10-17@08:00'] }), makeEntry({ id: 'e2', status: 'waiting' })],
        }),
      ],
    })
    const startsAt = new Date('2026-10-17T11:00:00Z')
    const input = scheduleInput(
      championship,
      { groups: [], matches: [makeMatch({ courtId: 'court-1', startsAt, pinned: true })] },
      TIMEZONE,
    )
    expect(input.entries).toEqual([
      { id: 'e1', name: 'Ana y Pedro', playerIds: ['pl-ana', 'pl-pedro'], unavailable: ['2026-10-17@08:00'] },
    ])
    expect(input.matches[0]).toMatchObject({ id: 'm1', minutes: 60, pinned: true, courtId: 'court-1', startsAt })
    expect(input.windows).toBe(championship.windows)
  })

  it('sends the slots as save_championship_schedule takes them', () => {
    expect(
      schedulePayload({
        slots: [
          {
            matchId: 'm1',
            courtId: 'court-1',
            startsAt: new Date('2026-10-17T11:00:00Z'),
            endsAt: new Date('2026-10-17T12:30:00Z'),
          },
        ],
        unplaced: [{ matchId: 'm2', reason: 'No quedan canchas libres en los días de juego.' }],
      }),
    ).toEqual([{ match_id: 'm1', court_id: 'court-1', starts_at: '2026-10-17T11:00:00.000Z' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/championship-schedule.test.ts`
Expected: FAIL — `Cannot find module '@/lib/domain/championship-schedule'`.

- [ ] **Step 3: Write minimal implementation**

`lib/domain/championship-schedule.ts`:
```ts
import type { Fixture, MatchSource, MatchStage } from './championship-fixture'
import { championshipBlocks, pairName, type Championship, type ChampionshipWindow } from './championships'
import { localDateOf, minutesOfDay, parseLocalDate, parseTime, zonedTime, type LocalDate } from './time'

// The schedule of a championship (design: "Programación"): every match on a court and a start inside the days of
// play, on the steps of its category's minutes. Hard rules: one match per court; nobody in two places at once (a
// player of two categories too); 45 minutes of rest for a pair; a knockout match after the ones that define it,
// plus the rest; no match when a known pair said it cannot play. Soft ones: no pair waits more than 3 hours on a
// day, finals at the end of the last day, courts used evenly. Most constrained first, the first valid start, then
// swaps. A side not known yet ("1° Zona A") is a token: two different tokens are never the same pair, and for
// players of two categories it stands for everyone in its group. save_championship_schedule checks the hard rules
// again.

export const REST_MINUTES = 45
export const LONG_WAIT_MINUTES = 180

export type ScheduleEntry = { id: string; name: string; playerIds: string[]; unavailable: string[] }
export type ScheduleMatch = {
  id: string
  categoryId: string
  minutes: number
  stage: MatchStage
  groupId: string | null
  round: number | null
  position: number | null
  entryA: string | null
  entryB: string | null
  sourceA: MatchSource | null
  sourceB: MatchSource | null
  pinned: boolean
  courtId: string | null
  startsAt: Date | null
}
export type ScheduleInput = {
  timezone: string
  windows: ChampionshipWindow[]
  entries: ScheduleEntry[]
  matches: ScheduleMatch[]
}
export type ScheduledSlot = { matchId: string; courtId: string; startsAt: Date; endsAt: Date }
export type Unplaced = { matchId: string; reason: string }
export type ScheduleResult = { slots: ScheduledSlot[]; unplaced: Unplaced[] }
export type SlotOption = { courtId: string; startsAt: Date }
export type ScheduleProblem = 'order' | 'unavailable' | 'rest' | 'players' | 'court'

// A start on a court, in minutes of the club's wall clock counted from 1970-01-01, so days compare.
type Slot = { courtId: string; date: LocalDate; start: number; end: number }
type Found = { problem: ScheduleProblem; entryId: string | null }
type Plan = {
  byId: Map<string, ScheduleMatch>
  tokens: Map<string, string[]>
  players: Map<string, string[]>
  feeders: Map<string, string[]>
  dependents: Map<string, string[]>
  unavailable: Map<string, { start: number; end: number }[]>
  entryName: Map<string, string>
  candidates: Map<string, Slot[]>
  courtOrder: Map<string, number>
  categoryOrder: Map<string, number>
  lastDate: LocalDate
  placed: Map<string, Slot>
  byCourt: Map<string, Set<string>>
  byToken: Map<string, Set<string>>
  byPlayer: Map<string, Set<string>>
}

const REASONS: Record<ScheduleProblem, (name: string | null) => string> = {
  order: () => 'Los partidos que lo definen terminan tarde: no queda horario después del descanso.',
  unavailable: (name) => `${name ?? 'Una pareja'} no tiene horario disponible en los días de juego.`,
  rest: (name) => `${name ?? 'Una pareja'} no llega a descansar 45 minutos entre partidos.`,
  players: () => 'Algún jugador ya juega en otra categoría en los horarios que quedan.',
  court: () => 'No quedan canchas libres en los días de juego.',
}

function dayStart(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date)
  return Date.UTC(year, month - 1, day) / 60_000
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end
}

function addTo(map: Map<string, Set<string>>, key: string, id: string): void {
  const set = map.get(key) ?? new Set<string>()
  set.add(id)
  map.set(key, set)
}

function toSlot(match: ScheduleMatch, timezone: string): Slot | null {
  if (!match.courtId || !match.startsAt) return null
  const date = localDateOf(match.startsAt, timezone)
  const start = dayStart(date) + minutesOfDay(match.startsAt, timezone)
  return { courtId: match.courtId, date, start, end: start + match.minutes }
}

function instant(slot: Slot, minute: number, timezone: string): Date {
  return zonedTime(slot.date, minute - dayStart(slot.date), timezone)
}

// Every start of every day of play on each of its courts, on the steps of `minutes`.
function candidatesFor(windows: ChampionshipWindow[], minutes: number, courtOrder: Map<string, number>): Slot[] {
  const out: Slot[] = []
  for (const window of windows) {
    const base = dayStart(window.date)
    const to = parseTime(window.toTime)
    for (let start = parseTime(window.fromTime); start + minutes <= to; start += minutes) {
      for (const courtId of window.courtIds) {
        out.push({ courtId, date: window.date, start: base + start, end: base + start + minutes })
      }
    }
  }
  return out.sort((a, b) => a.start - b.start || (courtOrder.get(a.courtId) ?? 0) - (courtOrder.get(b.courtId) ?? 0))
}

function makePlan(input: ScheduleInput): Plan {
  const byId = new Map(input.matches.map((match) => [match.id, match]))
  const entries = new Map(input.entries.map((entry) => [entry.id, entry]))
  const groupMembers = new Map<string, Set<string>>()
  const groupMatches = new Map<string, string[]>()
  for (const match of input.matches) {
    if (match.stage !== 'group' || !match.groupId) continue
    groupMatches.set(match.groupId, [...(groupMatches.get(match.groupId) ?? []), match.id])
    for (const entryId of [match.entryA, match.entryB]) if (entryId) addTo(groupMembers, match.groupId, entryId)
  }

  const tokens = new Map<string, string[]>()
  const tokensOf = (match: ScheduleMatch): string[] => {
    const known = tokens.get(match.id)
    if (known) return known
    const out = new Set<string>()
    const sides: [string | null, MatchSource | null][] = [
      [match.entryA, match.sourceA],
      [match.entryB, match.sourceB],
    ]
    for (const [entryId, source] of sides) {
      if (entryId) out.add(`entry:${entryId}`)
      else if (source?.kind === 'group') out.add(`group:${source.groupId}#${source.place}`)
      else if (source?.kind === 'winner') {
        const feeder = byId.get(source.matchId)
        if (feeder) for (const token of tokensOf(feeder)) out.add(token)
      }
    }
    tokens.set(match.id, [...out])
    return [...out]
  }
  const playersOfToken = (token: string): string[] => {
    if (token.startsWith('entry:')) return entries.get(token.slice(6))?.playerIds ?? []
    const groupId = token.slice(6, token.lastIndexOf('#'))
    return [...(groupMembers.get(groupId) ?? [])].flatMap((entryId) => entries.get(entryId)?.playerIds ?? [])
  }

  const players = new Map<string, string[]>()
  const feeders = new Map<string, string[]>()
  const dependents = new Map<string, string[]>()
  for (const match of input.matches) {
    players.set(match.id, [...new Set(tokensOf(match).flatMap(playersOfToken))])
    const before = new Set(
      [match.sourceA, match.sourceB].flatMap((source) =>
        source?.kind === 'winner'
          ? [source.matchId]
          : source?.kind === 'group'
            ? (groupMatches.get(source.groupId) ?? [])
            : [],
      ),
    )
    feeders.set(match.id, [...before])
    for (const feederId of before) dependents.set(feederId, [...(dependents.get(feederId) ?? []), match.id])
  }

  const blocks = championshipBlocks(input.windows)
  const unavailable = new Map(
    input.entries.map((entry) => [
      entry.id,
      blocks
        .filter((block) => entry.unavailable.includes(block.key))
        .map((block) => ({
          start: dayStart(block.date) + parseTime(block.fromTime),
          end: dayStart(block.date) + parseTime(block.toTime),
        })),
    ]),
  )
  const courtOrder = new Map<string, number>()
  for (const window of input.windows) {
    for (const courtId of window.courtIds) if (!courtOrder.has(courtId)) courtOrder.set(courtId, courtOrder.size)
  }
  const categoryOrder = new Map<string, number>()
  for (const match of input.matches) {
    if (!categoryOrder.has(match.categoryId)) categoryOrder.set(match.categoryId, categoryOrder.size)
  }
  const byMinutes = new Map<number, Slot[]>()
  const candidates = new Map(
    input.matches.map((match) => {
      const list = byMinutes.get(match.minutes) ?? candidatesFor(input.windows, match.minutes, courtOrder)
      byMinutes.set(match.minutes, list)
      return [match.id, list]
    }),
  )
  return {
    byId,
    tokens,
    players,
    feeders,
    dependents,
    unavailable,
    entryName: new Map(input.entries.map((entry) => [entry.id, entry.name])),
    candidates,
    courtOrder,
    categoryOrder,
    lastDate: input.windows.reduce((last, window) => (window.date > last ? window.date : last), ''),
    placed: new Map(),
    byCourt: new Map(),
    byToken: new Map(),
    byPlayer: new Map(),
  }
}

function place(plan: Plan, matchId: string, slot: Slot): void {
  plan.placed.set(matchId, slot)
  addTo(plan.byCourt, slot.courtId, matchId)
  for (const token of plan.tokens.get(matchId) ?? []) addTo(plan.byToken, token, matchId)
  for (const player of plan.players.get(matchId) ?? []) addTo(plan.byPlayer, player, matchId)
}

function unplace(plan: Plan, matchId: string): void {
  const slot = plan.placed.get(matchId)
  if (!slot) return
  plan.placed.delete(matchId)
  plan.byCourt.get(slot.courtId)?.delete(matchId)
  for (const token of plan.tokens.get(matchId) ?? []) plan.byToken.get(token)?.delete(matchId)
  for (const player of plan.players.get(matchId) ?? []) plan.byPlayer.get(player)?.delete(matchId)
}

function placeAll(plan: Plan, input: ScheduleInput, except?: string): void {
  for (const match of input.matches) {
    const slot = match.id === except ? null : toSlot(match, input.timezone)
    if (slot) place(plan, match.id, slot)
  }
}

// The first hard rule a match breaks at that slot, against what is placed; null when it fits.
function problemAt(plan: Plan, match: ScheduleMatch, slot: Slot): Found | null {
  for (const feederId of plan.feeders.get(match.id) ?? []) {
    const feeder = plan.placed.get(feederId)
    if (!feeder || slot.start < feeder.end + REST_MINUTES) return { problem: 'order', entryId: null }
  }
  for (const dependentId of plan.dependents.get(match.id) ?? []) {
    const dependent = plan.placed.get(dependentId)
    if (dependent && dependent.start < slot.end + REST_MINUTES) return { problem: 'order', entryId: null }
  }
  for (const entryId of [match.entryA, match.entryB]) {
    if (entryId && (plan.unavailable.get(entryId) ?? []).some((block) => overlaps(block, slot))) {
      return { problem: 'unavailable', entryId }
    }
  }
  for (const token of plan.tokens.get(match.id) ?? []) {
    for (const otherId of plan.byToken.get(token) ?? []) {
      const other = plan.placed.get(otherId)
      if (otherId === match.id || !other) continue
      if (slot.start < other.end + REST_MINUTES && other.start < slot.end + REST_MINUTES) {
        return { problem: 'rest', entryId: token.startsWith('entry:') ? token.slice(6) : null }
      }
    }
  }
  for (const player of plan.players.get(match.id) ?? []) {
    for (const otherId of plan.byPlayer.get(player) ?? []) {
      const other = plan.placed.get(otherId)
      if (otherId === match.id || !other || plan.byId.get(otherId)?.categoryId === match.categoryId) continue
      if (overlaps(slot, other)) return { problem: 'players', entryId: null }
    }
  }
  for (const otherId of plan.byCourt.get(slot.courtId) ?? []) {
    const other = plan.placed.get(otherId)
    if (otherId !== match.id && other && overlaps(slot, other)) return { problem: 'court', entryId: null }
  }
  return null
}

// How many of the match's known pairs would wait more than 3 hours on that day for their match before or after.
function waitPenalty(plan: Plan, match: ScheduleMatch, slot: Slot): number {
  let penalty = 0
  for (const entryId of [match.entryA, match.entryB]) {
    if (!entryId) continue
    let nearest = Infinity
    for (const otherId of plan.byToken.get(`entry:${entryId}`) ?? []) {
      const other = plan.placed.get(otherId)
      if (otherId === match.id || !other || other.date !== slot.date) continue
      nearest = Math.min(nearest, other.end <= slot.start ? slot.start - other.end : other.start - slot.end)
    }
    if (nearest !== Infinity && nearest > LONG_WAIT_MINUTES) penalty++
  }
  return penalty
}

// Smaller is better. A final: the last day, as late as it fits. Any other match: no long wait, the first start,
// the least used court.
function scoreOf(plan: Plan, match: ScheduleMatch, slot: Slot): number[] {
  const courtUse = plan.byCourt.get(slot.courtId)?.size ?? 0
  const court = plan.courtOrder.get(slot.courtId) ?? 0
  if (match.stage === 'knockout' && match.round === 1) {
    return [slot.date === plan.lastDate ? 0 : 1, -slot.start, courtUse, court]
  }
  return [waitPenalty(plan, match, slot), slot.start, courtUse, court]
}

function better(a: number[], b: number[]): boolean {
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return a[index] < b[index]
  return false
}

function placeBest(plan: Plan, match: ScheduleMatch): void {
  let best: Slot | null = null
  let bestScore: number[] = []
  for (const slot of plan.candidates.get(match.id) ?? []) {
    if (problemAt(plan, match, slot)) continue
    const score = scoreOf(plan, match, slot)
    if (!best || better(score, bestScore)) {
      best = slot
      bestScore = score
    }
  }
  if (best) place(plan, match.id, best)
}

// How many starts a pair's unavailability leaves to a match: the fewest go first.
function freeSlots(plan: Plan, match: ScheduleMatch): number {
  return (plan.candidates.get(match.id) ?? []).filter((slot) =>
    [match.entryA, match.entryB].every(
      (entryId) => !entryId || !(plan.unavailable.get(entryId) ?? []).some((block) => overlaps(block, slot)),
    ),
  ).length
}

// Swaps two group matches of the same length when that shortens long waits and keeps every hard rule.
function improve(plan: Plan, movable: ScheduleMatch[]): void {
  for (const x of movable) {
    const sx = plan.placed.get(x.id)
    if (!sx || waitPenalty(plan, x, sx) === 0) continue
    for (const y of movable) {
      const sy = plan.placed.get(y.id)
      if (y.id === x.id || y.minutes !== x.minutes || !sy) continue
      const before = waitPenalty(plan, x, sx) + waitPenalty(plan, y, sy)
      unplace(plan, x.id)
      unplace(plan, y.id)
      let swapped = false
      if (!problemAt(plan, x, sy)) {
        place(plan, x.id, sy)
        if (!problemAt(plan, y, sx)) {
          place(plan, y.id, sx)
          if (waitPenalty(plan, x, sy) + waitPenalty(plan, y, sx) < before) swapped = true
          else unplace(plan, y.id)
        }
        if (!swapped) unplace(plan, x.id)
      }
      if (swapped) break
      place(plan, x.id, sx)
      place(plan, y.id, sy)
    }
  }
}

function reasonFor(plan: Plan, match: ScheduleMatch): string {
  const candidates = plan.candidates.get(match.id) ?? []
  if (candidates.length === 0) return `Ningún día de juego tiene lugar para un partido de ${match.minutes} minutos.`
  const counts = new Map<ScheduleProblem, { count: number; entryId: string | null }>()
  for (const slot of candidates) {
    const found = problemAt(plan, match, slot)
    if (!found) return 'Hay lugar: volvé a programar o ubicalo a mano.'
    const current = counts.get(found.problem)
    counts.set(found.problem, { count: (current?.count ?? 0) + 1, entryId: current?.entryId ?? found.entryId })
  }
  const [problem, { entryId }] = [...counts.entries()].sort((a, b) => b[1].count - a[1].count)[0]
  return REASONS[problem](entryId ? (plan.entryName.get(entryId) ?? null) : null)
}

export function scheduleChampionship(input: ScheduleInput): ScheduleResult {
  const plan = makePlan(input)
  const free: ScheduleMatch[] = []
  for (const match of input.matches) {
    const slot = match.pinned ? toSlot(match, input.timezone) : null
    if (slot) place(plan, match.id, slot)
    else free.push(match)
  }
  const category = (match: ScheduleMatch) => plan.categoryOrder.get(match.categoryId) ?? 0
  const room = new Map(free.map((match) => [match.id, freeSlots(plan, match)]))
  const groupStage = free
    .filter((match) => match.stage === 'group')
    .sort((a, b) => (room.get(a.id) ?? 0) - (room.get(b.id) ?? 0) || category(a) - category(b))
  for (const match of groupStage) placeBest(plan, match)
  improve(plan, groupStage)
  const knockout = free
    .filter((match) => match.stage === 'knockout')
    .sort((a, b) => (b.round ?? 0) - (a.round ?? 0) || category(a) - category(b) || (a.position ?? 0) - (b.position ?? 0))
  for (const match of knockout) placeBest(plan, match)

  return {
    slots: free.flatMap((match) => {
      const slot = plan.placed.get(match.id)
      return slot
        ? [{
            matchId: match.id,
            courtId: slot.courtId,
            startsAt: instant(slot, slot.start, input.timezone),
            endsAt: instant(slot, slot.end, input.timezone),
          }]
        : []
    }),
    unplaced: free.filter((match) => !plan.placed.has(match.id)).map((match) => ({ matchId: match.id, reason: reasonFor(plan, match) })),
  }
}

// "Editar": every other court and start where the match fits, the rest staying where they are.
export function slotOptions(input: ScheduleInput, matchId: string): SlotOption[] {
  const plan = makePlan(input)
  const match = plan.byId.get(matchId)
  if (!match) return []
  placeAll(plan, input, matchId)
  const current = toSlot(match, input.timezone)
  return (plan.candidates.get(matchId) ?? [])
    .filter((slot) => !(current && slot.courtId === current.courtId && slot.start === current.start))
    .filter((slot) => !problemAt(plan, match, slot))
    .map((slot) => ({ courtId: slot.courtId, startsAt: instant(slot, slot.start, input.timezone) }))
}

// Why each match without a court has none, given where the rest are.
export function unplacedReasons(input: ScheduleInput): Unplaced[] {
  const plan = makePlan(input)
  placeAll(plan, input)
  return input.matches
    .filter((match) => !plan.placed.has(match.id))
    .map((match) => ({ matchId: match.id, reason: reasonFor(plan, match) }))
}

// The hard rules each placed match breaks (none, for a schedule this module made).
export function checkSchedule(input: ScheduleInput): { matchId: string; problem: ScheduleProblem }[] {
  const plan = makePlan(input)
  placeAll(plan, input)
  const out: { matchId: string; problem: ScheduleProblem }[] = []
  for (const match of input.matches) {
    const slot = plan.placed.get(match.id)
    if (!slot) continue
    unplace(plan, match.id)
    const found = problemAt(plan, match, slot)
    place(plan, match.id, slot)
    if (found) out.push({ matchId: match.id, problem: found.problem })
  }
  return out
}

// The input with the result in place: the slots given, pinned matches where they were, the rest without a court.
export function applySchedule(input: ScheduleInput, result: ScheduleResult): ScheduleInput {
  const slots = new Map(result.slots.map((slot) => [slot.matchId, slot]))
  return {
    ...input,
    matches: input.matches.map((match) => {
      const slot = slots.get(match.id)
      if (slot) return { ...match, courtId: slot.courtId, startsAt: slot.startsAt }
      return match.pinned ? match : { ...match, courtId: null, startsAt: null }
    }),
  }
}

// The championship's pairs with a place and its matches, in the order of its categories.
export function scheduleInput(
  championship: Pick<Championship, 'windows' | 'categories'>,
  fixture: Fixture,
  timezone: string,
): ScheduleInput {
  const minutes = new Map(championship.categories.map((category) => [category.id, category.matchMinutes]))
  const order = new Map(championship.categories.map((category, index) => [category.id, index]))
  return {
    timezone,
    windows: championship.windows,
    entries: championship.categories.flatMap((category) =>
      category.entries
        .filter((entry) => entry.status === 'active')
        .map((entry) => ({
          id: entry.id,
          name: pairName(entry),
          playerIds: [entry.player1.id, entry.player2.id],
          unavailable: entry.unavailable,
        })),
    ),
    matches: [...fixture.matches]
      .sort((a, b) => (order.get(a.categoryId) ?? 0) - (order.get(b.categoryId) ?? 0))
      .map((match) => ({
        id: match.id,
        categoryId: match.categoryId,
        minutes: minutes.get(match.categoryId) ?? 90,
        stage: match.stage,
        groupId: match.groupId,
        round: match.round,
        position: match.position,
        entryA: match.entryA,
        entryB: match.entryB,
        sourceA: match.sourceA,
        sourceB: match.sourceB,
        pinned: match.pinned,
        courtId: match.courtId,
        startsAt: match.startsAt,
      })),
  }
}

// What save_championship_schedule takes.
export function schedulePayload(result: ScheduleResult) {
  return result.slots.map((slot) => ({
    match_id: slot.matchId,
    court_id: slot.courtId,
    starts_at: slot.startsAt.toISOString(),
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/championship-schedule.test.ts`
Expected: PASS (el caso del spec corre en menos de un par de segundos).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/championship-schedule.ts tests/unit/lib/domain/championship-schedule.test.ts
git commit -m "feat: championship scheduler with hard rules, soft preferences and reasons"
```

---

### Task 15: Lo que muestran las pantallas (`lib/domain/championship-views.ts`)

**Files:**
- Create: `lib/domain/championship-views.ts`
- Test: `tests/unit/lib/domain/championship-views.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/domain/championship-views.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  brackets,
  byDay,
  championshipShareText,
  dayBoard,
  finishable,
  matchViews,
  myMatchViews,
  seedPairs,
  zoneViews,
  type ViewContext,
} from '@/lib/domain/championship-views'
import { BRUNO, LUCIA, makeCategory, makeChampionship, makeEntry, TIMEZONE } from '../../fixtures/championships'
import { makeGroup, makeMatch, members, set } from '../../fixtures/championship-fixture'

// Saturday 17: Ana and Pedro beat Bruno and Lucía at 08:00 on Cancha 1; the final is at 11:00 on Cancha 2.
const CHAMPIONSHIP = makeChampionship({
  categories: [
    makeCategory({ entries: [makeEntry({ id: 'e1' }), makeEntry({ id: 'e2', player1: BRUNO, player2: LUCIA })] }),
  ],
})
const PLAYED = makeMatch({
  courtId: 'court-1',
  startsAt: new Date('2026-10-17T11:00:00Z'),
  endsAt: new Date('2026-10-17T12:30:00Z'),
  status: 'finished',
  winner: 'e1',
  sets: [set(6, 3), set(6, 3)],
})
const FINAL = makeMatch({
  id: 'f',
  stage: 'knockout',
  groupId: null,
  round: 1,
  position: 1,
  entryA: null,
  entryB: null,
  sourceA: { kind: 'group', groupId: 'g1', place: 1 },
  sourceB: { kind: 'group', groupId: 'g1', place: 2 },
  courtId: 'court-2',
  startsAt: new Date('2026-10-17T14:00:00Z'),
  endsAt: new Date('2026-10-17T15:30:00Z'),
})
const FIXTURE = { groups: [makeGroup({ members: members(['e1', 'e2']) })], matches: [FINAL, PLAYED] }
const CTX: ViewContext = {
  timezone: TIMEZONE,
  today: '2026-10-17',
  courtName: new Map([
    ['court-1', 'Cancha 1'],
    ['court-2', 'Cancha 2'],
  ]),
}

describe('matchViews', () => {
  it('names every match and side, with its day, time, court, state and score, in order', () => {
    const [played, final] = matchViews(CHAMPIONSHIP, FIXTURE, CTX)
    expect(played).toMatchObject({
      id: 'm1',
      categoryName: '6ta Libre',
      name: 'Zona A',
      sideA: 'Ana y Pedro',
      sideB: 'Bruno y Lucía',
      day: 'Hoy',
      time: '08:00',
      court: 'Cancha 1',
      statusLabel: 'Terminado',
      score: '6-3 6-3',
      winner: 'a',
      ready: true,
    })
    expect(final).toMatchObject({
      name: 'Final',
      sideA: '1° Zona A',
      sideB: '2° Zona A',
      time: '11:00',
      court: 'Cancha 2',
      score: null,
      winner: null,
      ready: false,
    })
  })

  it('splits the tournament day and the days of play', () => {
    const views = matchViews(CHAMPIONSHIP, FIXTURE, CTX)
    const board = dayBoard(views)
    expect(board.playing).toEqual([])
    expect(board.upcoming.map((view) => view.id)).toEqual(['f'])
    expect(board.finished.map((view) => view.id)).toEqual(['m1'])
    expect(byDay(views)).toEqual([{ key: '2026-10-17', label: 'Sábado 17 de octubre', matches: views }])
  })
})

describe('zones and brackets', () => {
  it('shows each group with its table, and asks to close it when it is complete', () => {
    expect(zoneViews(CHAMPIONSHIP, FIXTURE)).toEqual([
      {
        id: 'g1',
        categoryId: 'k1',
        categoryName: '6ta Libre',
        name: 'Zona A',
        complete: true,
        closed: false,
        needsOrder: true,
        tiedNames: [],
        rows: [
          { entryId: 'e1', name: 'Ana y Pedro', played: 1, won: 1, lost: 0, sets: '2-0', games: '12-6' },
          { entryId: 'e2', name: 'Bruno y Lucía', played: 1, won: 0, lost: 1, sets: '0-2', games: '6-12' },
        ],
      },
    ])
  })

  it('shows each category\'s bracket by rounds', () => {
    const views = matchViews(CHAMPIONSHIP, FIXTURE, CTX)
    expect(brackets(CHAMPIONSHIP, views)).toEqual([
      { categoryId: 'k1', categoryName: '6ta Libre', rounds: [{ round: 1, name: 'Final', matches: [views[1]] }] },
    ])
  })

  it('finishes when every match is played and every group closed', () => {
    expect(finishable(FIXTURE)).toBe(false)
    const closed = makeGroup({ members: [{ entryId: 'e1', drawPosition: 1, place: 1 }, { entryId: 'e2', drawPosition: 2, place: 2 }] })
    expect(finishable({ groups: [closed], matches: [PLAYED, { ...FINAL, status: 'finished', winner: 'e1', entryA: 'e1', entryB: 'e2' }] })).toBe(true)
  })
})

describe('for the players', () => {
  it('lists the viewer\'s matches with the rival', () => {
    const mine = myMatchViews(CHAMPIONSHIP, matchViews(CHAMPIONSHIP, FIXTURE, CTX), 'u-ana')
    expect(mine.map((view) => [view.id, view.rival])).toEqual([['m1', 'Bruno y Lucía']])
    expect(myMatchViews(CHAMPIONSHIP, matchViews(CHAMPIONSHIP, FIXTURE, CTX), 'u-nadie')).toEqual([])
  })

  it('words the message to share', () => {
    expect(championshipShareText('Campeonato de Primavera', 'https://rustic.uy/c/primavera-7k2f')).toBe(
      'Seguí el Campeonato de Primavera en vivo: https://rustic.uy/c/primavera-7k2f',
    )
  })
})

describe('seedPairs', () => {
  it('lists the pairs with a place, strongest first, with what they declared', () => {
    const category = makeCategory({
      entries: [
        makeEntry({ id: 'e1' }),
        makeEntry({ id: 'e2', player1: BRUNO, player2: LUCIA, level1: 4, level2: 4, seed: 1 }),
        makeEntry({ id: 'e3', status: 'waiting' }),
      ],
    })
    expect(seedPairs(category)).toEqual([
      { id: 'e2', name: 'Bruno y Lucía', levels: 'Declaran 4ª y 4ª (suma 8)', seed: 1 },
      { id: 'e1', name: 'Ana y Pedro', levels: 'Declaran 5ª y 6ª (suma 11)', seed: null },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/championship-views.test.ts`
Expected: FAIL — `Cannot find module '@/lib/domain/championship-views'`.

- [ ] **Step 3: Write minimal implementation**

`lib/domain/championship-views.ts`:
```ts
import { seedOrder } from './championship-draw'
import {
  isDone,
  matchName,
  MATCH_STATUS_LABELS,
  roundName,
  scoreText,
  sideName,
  type Fixture,
  type MatchSet,
  type MatchStage,
  type MatchStatus,
} from './championship-fixture'
import { blockingTies, decisivePlaces, groupStandings } from './championship-standings'
import { activeEntries, isEntryPlayer, pairName, type Championship, type ChampionshipCategory } from './championships'
import { dayLabel, dayLongLabel, timeIn } from './format'
import { localDateOf, type LocalDate } from './time'

// What the screens of the fixture show (design: "Pantallas"): every match with its names, day, court, state and
// score; the tournament day; the tables of the groups; the brackets; the viewer's matches.

export type ViewContext = { timezone: string; today: LocalDate; courtName: Map<string, string> }
export type MatchView = {
  id: string
  categoryId: string
  categoryName: string
  // "Zona A", "Semifinal 1".
  name: string
  stage: MatchStage
  groupId: string | null
  round: number | null
  position: number | null
  sideA: string
  sideB: string
  entryA: string | null
  entryB: string | null
  startsAt: Date | null
  date: LocalDate | null
  // "Hoy", "Mañana", "sáb 17".
  day: string | null
  time: string | null
  court: string | null
  status: MatchStatus
  statusLabel: string
  score: string | null
  winner: 'a' | 'b' | null
  sets: MatchSet[]
  pinned: boolean
  // Both pairs are known: it can start.
  ready: boolean
}
export type DayGroup = { key: string; label: string; matches: MatchView[] }
export type ZoneRow = { entryId: string; name: string; played: number; won: number; lost: number; sets: string; games: string }
export type ZoneView = {
  id: string
  categoryId: string
  categoryName: string
  name: string
  complete: boolean
  closed: boolean
  // Complete and not closed: "Cerrar zona" (a tie, or it did not close by itself).
  needsOrder: boolean
  // Pairs still level on a place that matters: "Ana y Pedro y Bruno y Lucía".
  tiedNames: string[]
  rows: ZoneRow[]
}
export type BracketRound = { round: number; name: string; matches: MatchView[] }
export type Bracket = { categoryId: string; categoryName: string; rounds: BracketRound[] }
export type MyMatchView = MatchView & { rival: string }
export type MyMatchItem = MyMatchView & { href: string; championshipName: string | null }
export type SeedPair = { id: string; name: string; levels: string; seed: number | null }

function entryNames(championship: Pick<Championship, 'categories'>): Map<string, string> {
  return new Map(championship.categories.flatMap((category) => category.entries.map((entry) => [entry.id, pairName(entry)] as const)))
}

function startOf(view: MatchView): number {
  return view.startsAt?.getTime() ?? Number.MAX_SAFE_INTEGER
}

export function matchViews(championship: Pick<Championship, 'categories'>, fixture: Fixture, ctx: ViewContext): MatchView[] {
  const names = entryNames(championship)
  const categoryName = new Map(championship.categories.map((category) => [category.id, category.name]))
  const order = new Map(championship.categories.map((category, index) => [category.id, index]))
  const entryName = (entryId: string) => names.get(entryId) ?? 'Pareja'
  return fixture.matches
    .map((match): MatchView => {
      const date = match.startsAt ? localDateOf(match.startsAt, ctx.timezone) : null
      return {
        id: match.id,
        categoryId: match.categoryId,
        categoryName: categoryName.get(match.categoryId) ?? '',
        name: matchName(fixture, match),
        stage: match.stage,
        groupId: match.groupId,
        round: match.round,
        position: match.position,
        sideA: sideName(fixture, match, 'a', entryName),
        sideB: sideName(fixture, match, 'b', entryName),
        entryA: match.entryA,
        entryB: match.entryB,
        startsAt: match.startsAt,
        date,
        day: date ? dayLabel(date, ctx.today) : null,
        time: match.startsAt ? timeIn(match.startsAt, ctx.timezone) : null,
        court: match.courtId ? (ctx.courtName.get(match.courtId) ?? 'Cancha') : null,
        status: match.status,
        statusLabel: MATCH_STATUS_LABELS[match.status],
        score: scoreText(match),
        winner: match.winner === null ? null : match.winner === match.entryA ? 'a' : 'b',
        sets: match.sets,
        pinned: match.pinned,
        ready: match.entryA !== null && match.entryB !== null,
      }
    })
    .sort(
      (a, b) =>
        startOf(a) - startOf(b) ||
        (order.get(a.categoryId) ?? 0) - (order.get(b.categoryId) ?? 0) ||
        (a.court ?? '').localeCompare(b.court ?? ''),
    )
}

// "En juego ahora", the next ones and the last ones played.
export function dayBoard(views: MatchView[], limit = 6): { playing: MatchView[]; upcoming: MatchView[]; finished: MatchView[] } {
  return {
    playing: views.filter((view) => view.status === 'playing'),
    upcoming: views.filter((view) => view.status === 'scheduled' && view.startsAt !== null).slice(0, limit),
    finished: views.filter((view) => isDone(view)).reverse().slice(0, limit),
  }
}

// The matches by day of play ("Sábado 17 de octubre"), the ones without a time last.
export function byDay(views: MatchView[]): DayGroup[] {
  const days = new Map<string, DayGroup>()
  for (const view of views) {
    const key = view.date ?? 'sin-horario'
    const label = view.date ? dayLongLabel(view.date) : 'sin horario'
    const day = days.get(key) ?? { key, label: `${label.charAt(0).toUpperCase()}${label.slice(1)}`, matches: [] }
    day.matches.push(view)
    days.set(key, day)
  }
  return [...days.values()]
}

export function zoneViews(championship: Pick<Championship, 'categories'>, fixture: Fixture): ZoneView[] {
  const names = entryNames(championship)
  const categories = new Map(championship.categories.map((category) => [category.id, category]))
  const order = new Map(championship.categories.map((category, index) => [category.id, index]))
  return [...fixture.groups]
    .sort((a, b) => (order.get(a.categoryId) ?? 0) - (order.get(b.categoryId) ?? 0) || a.sortOrder - b.sortOrder)
    .map((group): ZoneView => {
      const category = categories.get(group.categoryId)
      const standings = groupStandings(group, fixture.matches)
      const places = category ? decisivePlaces(category, group.members.length) : group.members.length
      const closed = group.members.length > 0 && group.members.every((member) => member.place !== null)
      const place = new Map(group.members.map((member) => [member.entryId, member.place ?? 0]))
      const rows = closed
        ? [...standings.rows].sort((a, b) => (place.get(a.entryId) ?? 0) - (place.get(b.entryId) ?? 0))
        : standings.rows
      return {
        id: group.id,
        categoryId: group.categoryId,
        categoryName: category?.name ?? '',
        name: group.name,
        complete: standings.complete,
        closed,
        needsOrder: standings.complete && !closed,
        tiedNames: closed
          ? []
          : blockingTies(standings, places).map((level) => level.map((entryId) => names.get(entryId) ?? 'Pareja').join(' y ')),
        rows: rows.map((row) => ({
          entryId: row.entryId,
          name: names.get(row.entryId) ?? 'Pareja',
          played: row.played,
          won: row.won,
          lost: row.lost,
          sets: `${row.setsWon}-${row.setsLost}`,
          games: `${row.gamesWon}-${row.gamesLost}`,
        })),
      }
    })
}

// Each category's bracket, first round first.
export function brackets(championship: Pick<Championship, 'categories'>, views: MatchView[]): Bracket[] {
  return championship.categories.flatMap((category): Bracket[] => {
    const knockout = views.filter((view) => view.categoryId === category.id && view.stage === 'knockout')
    if (knockout.length === 0) return []
    const rounds = [...new Set(knockout.map((view) => view.round ?? 1))].sort((a, b) => b - a)
    return [
      {
        categoryId: category.id,
        categoryName: category.name,
        rounds: rounds.map((round) => ({
          round,
          name: roundName(round),
          matches: knockout
            .filter((view) => (view.round ?? 1) === round)
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
        })),
      },
    ]
  })
}

// "Mis partidos": the matches of the viewer's pairs with a place, each with the rival's name.
export function myMatchViews(championship: Pick<Championship, 'categories'>, views: MatchView[], profileId: string): MyMatchView[] {
  const mine = new Set(
    championship.categories.flatMap((category) =>
      activeEntries(category)
        .filter((entry) => isEntryPlayer(entry, profileId))
        .map((entry) => entry.id),
    ),
  )
  return views.flatMap((view): MyMatchView[] => {
    if (view.entryA && mine.has(view.entryA)) return [{ ...view, rival: view.sideB }]
    if (view.entryB && mine.has(view.entryB)) return [{ ...view, rival: view.sideA }]
    return []
  })
}

// Every match played and every group closed: "Finalizar".
export function finishable(fixture: Fixture): boolean {
  return (
    fixture.matches.length > 0 &&
    fixture.matches.every(isDone) &&
    fixture.groups.every((group) => group.members.every((member) => member.place !== null))
  )
}

// Design: "Compartir".
export function championshipShareText(name: string, url: string): string {
  return `Seguí el ${name} en vivo: ${url}`
}

// "Cabezas de serie": the pairs with a place in the order the draw takes them.
export function seedPairs(category: Pick<ChampionshipCategory, 'entries'>): SeedPair[] {
  return seedOrder(activeEntries(category)).map((entry) => ({
    id: entry.id,
    name: pairName(entry),
    levels: `Declaran ${entry.level1}ª y ${entry.level2}ª (suma ${entry.level1 + entry.level2})`,
    seed: entry.seed,
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/championship-views.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/championship-views.ts tests/unit/lib/domain/championship-views.test.ts
git commit -m "feat: what the fixture screens show (matches, day board, zones, brackets)"
```

---

### Task 16: Formularios y lectura pública

**Files:**
- Create: `lib/domain/championship-fixture-form.ts`
- Create: `lib/domain/championship-public.ts`
- Test: `tests/unit/lib/domain/championship-fixture-form.test.ts`, `tests/unit/lib/domain/championship-public.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/lib/domain/championship-fixture-form.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { readGroupOrderForm, readResultForm, readSeedsForm, readSlotForm } from '@/lib/domain/championship-fixture-form'

const CATEGORY = '22222222-2222-2222-2222-222222222222'
const MATCH = '33333333-3333-3333-3333-333333333333'
const COURT = '44444444-4444-4444-4444-444444444444'
const E1 = '55555555-5555-5555-5555-555555555551'
const E2 = '55555555-5555-5555-5555-555555555552'
const E3 = '55555555-5555-5555-5555-555555555553'

function form(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.append(key, value)
  return data
}

describe('readSeedsForm', () => {
  it('reads the seeds in order and skips the pairs without one', () => {
    expect(readSeedsForm(form({ categoryId: CATEGORY, [`seed:${E1}`]: '2', [`seed:${E2}`]: '', [`seed:${E3}`]: '1' }))).toEqual({
      ok: true,
      value: { categoryId: CATEGORY, entryIds: [E3, E1] },
    })
  })

  it('does not take two pairs with the same number', () => {
    expect(readSeedsForm(form({ categoryId: CATEGORY, [`seed:${E1}`]: '1', [`seed:${E2}`]: '1' }))).toEqual({
      ok: false,
      message: 'Dos parejas tienen el mismo número de cabeza de serie.',
    })
  })
})

describe('readResultForm', () => {
  it('reads two or three sets', () => {
    expect(readResultForm(form({ matchId: MATCH, a1: '6', b1: '4', a2: '3', b2: '6', a3: '10', b3: '8' }))).toEqual({
      ok: true,
      value: { matchId: MATCH, sets: [[6, 4], [3, 6], [10, 8]] },
    })
    expect(readResultForm(form({ matchId: MATCH, a1: '6', b1: '2', a2: '6', b2: '1', a3: '', b3: '' }))).toEqual({
      ok: true,
      value: { matchId: MATCH, sets: [[6, 2], [6, 1]] },
    })
  })

  it('says what is missing', () => {
    expect(readResultForm(form({ matchId: MATCH, a1: '6', b1: '' }))).toEqual({
      ok: false,
      message: 'Completá los dos números del set 1.',
    })
    expect(readResultForm(form({ matchId: MATCH, a1: '6', b1: '4', a2: '', b2: '', a3: '6', b3: '2' }))).toEqual({
      ok: false,
      message: 'Cargá el set 2 antes que el 3.',
    })
    expect(readResultForm(form({ matchId: MATCH }))).toEqual({ ok: false, message: 'Cargá al menos un set.' })
    expect(readResultForm(form({ matchId: MATCH, a1: 'seis', b1: '4' }))).toEqual({
      ok: false,
      message: 'Los games son números de 0 a 99.',
    })
  })
})

describe('readSlotForm', () => {
  it('reads the court and the start chosen together', () => {
    expect(readSlotForm(form({ matchId: MATCH, slot: `${COURT}|2026-10-17T11:00:00.000Z` }))).toEqual({
      ok: true,
      value: { matchId: MATCH, courtId: COURT, startsAt: '2026-10-17T11:00:00.000Z' },
    })
    expect(readSlotForm(form({ matchId: MATCH, slot: 'cualquiera' }))).toEqual({
      ok: false,
      message: 'Elegí una cancha y un horario.',
    })
  })
})

describe('readGroupOrderForm', () => {
  it('reads one place per pair, from the 1st on', () => {
    expect(readGroupOrderForm(form({ groupId: CATEGORY, [`place:${E1}`]: '2', [`place:${E2}`]: '1' }))).toEqual({
      ok: true,
      value: { groupId: CATEGORY, entryIds: [E2, E1] },
    })
    expect(readGroupOrderForm(form({ groupId: CATEGORY, [`place:${E1}`]: '1', [`place:${E2}`]: '1' }))).toEqual({
      ok: false,
      message: 'Cada pareja va en un puesto distinto, del 1 en adelante.',
    })
  })
})
```

`tests/unit/lib/domain/championship-public.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { isPublicCode, readPublicChampionship } from '@/lib/domain/championship-public'
import { pairName } from '@/lib/domain/championships'

const DATA = {
  club: { name: 'Rustic Pádel', logo_path: null, timezone: 'America/Montevideo' },
  championship: {
    id: 'ch1',
    name: 'Copa de Primavera',
    rules: 'Al mejor de 3 sets.',
    status: 'in_progress',
    public_code: 'copa-de-primavera-7k2f',
    poster_path: null,
  },
  windows: [{ id: 'w1', on_date: '2026-10-17', from_time: '08:00:00', to_time: '14:00:00', court_ids: ['court-1'] }],
  courts: [{ id: 'court-1', name: 'Cancha 1' }],
  categories: [
    {
      id: 'k1',
      name: '6ta Libre',
      gender: 'open',
      format: 'groups_knockout',
      group_size: 4,
      qualifiers_per_group: 2,
      match_minutes: 90,
      match_rules: { third_set: 'super_tiebreak' },
      sort_order: 0,
      entries: [
        { id: 'e1', player1_name: 'Ana', player2_name: 'Pedro' },
        { id: 'e2', player1_name: 'Bruno', player2_name: 'Lucía' },
      ],
    },
  ],
  groups: [
    {
      id: 'g1',
      category_id: 'k1',
      name: 'Zona A',
      sort_order: 0,
      members: [
        { entry_id: 'e1', draw_position: 1, place: null },
        { entry_id: 'e2', draw_position: 2, place: null },
      ],
    },
  ],
  matches: [
    {
      id: 'm1',
      category_id: 'k1',
      stage: 'group',
      group_id: 'g1',
      round: null,
      bracket_position: null,
      entry_a_id: 'e1',
      entry_b_id: 'e2',
      source_a: null,
      source_b: null,
      court_id: 'court-1',
      starts_at: '2026-10-17T11:00:00+00:00',
      ends_at: '2026-10-17T12:30:00+00:00',
      pinned: false,
      status: 'playing',
      winner_entry_id: null,
      walkover_entry_id: null,
      sets: [],
    },
  ],
}

describe('readPublicChampionship', () => {
  it('reads what public_championship returns', () => {
    const data = readPublicChampionship(DATA)
    expect(data).toMatchObject({
      clubName: 'Rustic Pádel',
      logoPath: null,
      timezone: 'America/Montevideo',
      code: 'copa-de-primavera-7k2f',
      courts: [{ id: 'court-1', name: 'Cancha 1' }],
    })
    expect(data?.championship.name).toBe('Copa de Primavera')
    expect(data?.championship.categories[0].entries.map(pairName)).toEqual(['Ana y Pedro', 'Bruno y Lucía'])
    expect(data?.championship.categories[0].thirdSet).toBe('super_tiebreak')
    expect(data?.fixture.matches[0]).toMatchObject({ id: 'm1', status: 'playing', courtId: 'court-1' })
    expect(data?.fixture.groups[0].members.map((member) => member.entryId)).toEqual(['e1', 'e2'])
  })

  it('reads nothing when the link leads nowhere', () => {
    expect(readPublicChampionship(null)).toBeNull()
    expect(readPublicChampionship({ club: {} })).toBeNull()
  })
})

describe('isPublicCode', () => {
  it('takes only codes like the ones the database makes', () => {
    expect(isPublicCode('copa-de-primavera-7k2f')).toBe(true)
    expect(isPublicCode('Copa')).toBe(false)
    expect(isPublicCode('a')).toBe(false)
    expect(isPublicCode('copa--7k2f')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/domain/championship-fixture-form.test.ts tests/unit/lib/domain/championship-public.test.ts`
Expected: FAIL — `Cannot find module '@/lib/domain/championship-fixture-form'` y `'@/lib/domain/championship-public'`.

- [ ] **Step 3: Los formularios**

`lib/domain/championship-fixture-form.ts`:
```ts
import type { Score } from './championship-results'
import { isUuid, readUuid } from './input'
import type { ParseResult } from './settings'

// The fixture forms, read before any RPC (Server Actions are reachable by any POST).

const INVALID = 'Revisá los datos ingresados.'

function fail<T>(message: string): ParseResult<T> {
  return { ok: false, message }
}

function text(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

// "seed:<entry id>" = 1, 2...; empty for none. The pairs come back strongest first.
export function readSeedsForm(form: FormData): ParseResult<{ categoryId: string; entryIds: string[] }> {
  const categoryId = readUuid(form, 'categoryId')
  if (!categoryId) return fail(INVALID)
  const seeds: { entryId: string; seed: number }[] = []
  for (const [key, value] of form.entries()) {
    if (!key.startsWith('seed:') || typeof value !== 'string' || value.trim() === '') continue
    const entryId = key.slice('seed:'.length)
    const seed = Number(value)
    if (!isUuid(entryId) || !Number.isInteger(seed) || seed < 1 || seed > 64) return fail(INVALID)
    seeds.push({ entryId: entryId.toLowerCase(), seed })
  }
  if (new Set(seeds.map((item) => item.seed)).size !== seeds.length) {
    return fail('Dos parejas tienen el mismo número de cabeza de serie.')
  }
  return { ok: true, value: { categoryId, entryIds: seeds.sort((a, b) => a.seed - b.seed).map((item) => item.entryId) } }
}

// a1/b1, a2/b2, a3/b3: the games of each side per set; the sets left empty go at the end.
export function readResultForm(form: FormData): ParseResult<{ matchId: string; sets: Score[] }> {
  const matchId = readUuid(form, 'matchId')
  if (!matchId) return fail(INVALID)
  const sets: Score[] = []
  let ended = false
  for (const number of [1, 2, 3]) {
    const a = text(form, `a${number}`)
    const b = text(form, `b${number}`)
    if (a === '' && b === '') {
      ended = true
      continue
    }
    if (ended) return fail(`Cargá el set ${number - 1} antes que el ${number}.`)
    if (a === '' || b === '') return fail(`Completá los dos números del set ${number}.`)
    if (!/^[0-9]{1,2}$/.test(a) || !/^[0-9]{1,2}$/.test(b)) return fail('Los games son números de 0 a 99.')
    sets.push([Number(a), Number(b)])
  }
  if (sets.length === 0) return fail('Cargá al menos un set.')
  return { ok: true, value: { matchId, sets } }
}

// "slot" = "<court id>|<start as ISO>", one option of the move sheet.
export function readSlotForm(form: FormData): ParseResult<{ matchId: string; courtId: string; startsAt: string }> {
  const matchId = readUuid(form, 'matchId')
  const [courtId, startsAt] = text(form, 'slot').split('|')
  const time = startsAt ? Date.parse(startsAt) : Number.NaN
  if (!matchId || !isUuid(courtId) || Number.isNaN(time)) return fail('Elegí una cancha y un horario.')
  return { ok: true, value: { matchId, courtId: courtId.toLowerCase(), startsAt: new Date(time).toISOString() } }
}

// "place:<entry id>" = 1, 2...: one place per pair, from the 1st on.
export function readGroupOrderForm(form: FormData): ParseResult<{ groupId: string; entryIds: string[] }> {
  const groupId = readUuid(form, 'groupId')
  if (!groupId) return fail(INVALID)
  const places: { entryId: string; place: number }[] = []
  for (const [key, value] of form.entries()) {
    if (!key.startsWith('place:') || typeof value !== 'string') continue
    const entryId = key.slice('place:'.length)
    const place = Number(value)
    if (!isUuid(entryId) || !Number.isInteger(place) || place < 1) return fail(INVALID)
    places.push({ entryId: entryId.toLowerCase(), place })
  }
  const sorted = places.sort((a, b) => a.place - b.place)
  if (sorted.length < 2 || sorted.some((item, index) => item.place !== index + 1)) {
    return fail('Cada pareja va en un puesto distinto, del 1 en adelante.')
  }
  return { ok: true, value: { groupId, entryIds: sorted.map((item) => item.entryId) } }
}
```

- [ ] **Step 4: La lectura pública**

`lib/domain/championship-public.ts`:
```ts
import { toFixture, type Fixture, type GroupRow, type MatchRow } from './championship-fixture'
import { toChampionship, type CategoryRow, type Championship, type ChampionshipRow, type EntryRow } from './championships'

// The public page of a championship (/c/<code>) reads public_championship: names, dates, categories, pairs and,
// once published, the groups and matches. It is turned into the same Championship and Fixture the app uses, with
// neutral values for what the public never sees (levels, prices, payments).

export type PublicChampionship = {
  clubName: string
  logoPath: string | null
  timezone: string
  code: string
  championship: Championship
  fixture: Fixture
  courts: { id: string; name: string }[]
}

type PublicEntry = { id: string; player1_name: string; player2_name: string }
type PublicCategory = Pick<
  CategoryRow,
  'id' | 'name' | 'gender' | 'format' | 'group_size' | 'qualifiers_per_group' | 'match_minutes' | 'match_rules' | 'sort_order'
> & { entries: PublicEntry[] }
type PublicData = {
  club: { name: string; logo_path: string | null; timezone: string }
  championship: {
    id: string
    name: string
    rules: string
    status: ChampionshipRow['status']
    public_code: string
    poster_path: string | null
  }
  windows: ChampionshipRow['windows']
  courts: { id: string; name: string }[]
  categories: PublicCategory[]
  groups: GroupRow[]
  matches: MatchRow[]
}

const CODE = /^[a-z0-9]+(-[a-z0-9]+)*$/

// The codes publish_championship makes ("copa-de-primavera-7k2f").
export function isPublicCode(value: string): boolean {
  return value.length >= 3 && value.length <= 40 && CODE.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function entryRow(entry: PublicEntry, index: number): EntryRow {
  return {
    id: entry.id,
    player1_level: 0,
    player2_level: 0,
    status: 'active',
    seed: null,
    unavailability_approved: false,
    // The database sends them in sign-up order; the order is all the page needs.
    created_at: new Date(index * 1000).toISOString(),
    player1: { id: '', name: entry.player1_name, profile_id: null },
    player2: { id: '', name: entry.player2_name, profile_id: null },
    payments: [],
    unavailability: [],
  }
}

// public_championship's jsonb (its shape is pinned by supabase/tests/database/championship_public.test.sql);
// null when the link leads nowhere.
export function readPublicChampionship(value: unknown): PublicChampionship | null {
  if (!isRecord(value) || !isRecord(value.club) || !isRecord(value.championship)) return null
  if (!['windows', 'courts', 'categories', 'groups', 'matches'].every((key) => Array.isArray(value[key]))) return null
  const data = value as PublicData
  const row: ChampionshipRow = {
    id: data.championship.id,
    name: data.championship.name,
    rules: data.championship.rules,
    poster_path: data.championship.poster_path,
    public_code: data.championship.public_code,
    status: data.championship.status,
    registration_opens_at: null,
    registration_closes_at: null,
    max_categories_per_player: 1,
    windows: data.windows,
    categories: data.categories.map(
      (category): CategoryRow => ({
        ...category,
        level_min: null,
        level_max: null,
        min_pairs: 2,
        max_pairs: 64,
        price: 0,
        seeding: 'manual',
        status: 'open',
        merged_into: null,
        entries: category.entries.map(entryRow),
      }),
    ),
  }
  return {
    clubName: data.club.name,
    logoPath: data.club.logo_path,
    timezone: data.club.timezone,
    code: data.championship.public_code,
    championship: toChampionship(row, data.club.timezone),
    fixture: toFixture(data.groups, data.matches),
    courts: data.courts,
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/lib/domain/championship-fixture-form.test.ts tests/unit/lib/domain/championship-public.test.ts
npm run typecheck
```
Expected: PASS; typecheck sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/championship-fixture-form.ts lib/domain/championship-public.ts tests/unit/lib/domain/championship-fixture-form.test.ts tests/unit/lib/domain/championship-public.test.ts
git commit -m "feat: fixture forms and the public championship reader"
```

---

## Corte 4: Datos y acciones

### Task 17: Lecturas del fixture (`lib/data/championship-fixture.ts`)

**Files:**
- Create: `lib/data/championship-fixture.ts`

- [ ] **Step 1: Write the reads** (# no unit test — lecturas con la sesión del usuario, como `lib/data/championships.ts`; las cubren typecheck, la página y el e2e)

`lib/data/championship-fixture.ts`:
```ts
import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import { loadChampionships } from '@/lib/data/championships'
import { loadActiveCourts } from '@/lib/data/tournaments'
import { isDone, toFixture, type Fixture } from '@/lib/domain/championship-fixture'
import { readPublicChampionship, type PublicChampionship } from '@/lib/domain/championship-public'
import { matchViews, myMatchViews, type MyMatchItem } from '@/lib/domain/championship-views'
import { myEntries } from '@/lib/domain/championships'
import { localDateOf } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'

// FK hints: every embed goes through a composite FK with club_id.
const GROUP_SELECT =
  'id, category_id, name, sort_order, members:championship_group_members!championship_group_members_group_in_club(entry_id, draw_position, place)'
const MATCH_SELECT =
  'id, category_id, stage, group_id, round, bracket_position, entry_a_id, entry_b_id, source_a, source_b, court_id, starts_at, ends_at, pinned, status, winner_entry_id, walkover_entry_id, sets:championship_match_sets!championship_match_sets_match_in_club(set_number, games_a, games_b, super_tiebreak)'

// The groups and matches of a championship, read with the viewer's session: staff from the draw on, members once
// it is published (RLS).
export async function loadFixture(championshipId: string): Promise<Fixture> {
  const supabase = await createClient()
  const [groups, matches] = await Promise.all([
    supabase.from('championship_groups').select(GROUP_SELECT).eq('championship_id', championshipId),
    supabase.from('championship_matches').select(MATCH_SELECT).eq('championship_id', championshipId),
  ])
  if (groups.error) throw groups.error
  if (matches.error) throw matches.error
  return toFixture(groups.data, matches.data)
}

// The public page: anyone with the link, with or without a session.
export async function loadPublicChampionship(code: string): Promise<PublicChampionship | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('public_championship', { p_code: code })
  if (error) throw error
  return readPublicChampionship(data)
}

// Inicio's "Mis partidos": what the viewer's pairs still have to play in championships published or in progress.
export async function loadMyChampionshipMatches(club: Club, profileId: string, now: Date): Promise<MyMatchItem[]> {
  const championships = (await loadChampionships(club)).filter(
    (championship) =>
      (championship.status === 'published' || championship.status === 'in_progress') &&
      myEntries(championship, profileId).length > 0,
  )
  if (championships.length === 0) return []
  const [courts, fixtures] = await Promise.all([
    loadActiveCourts(club),
    Promise.all(championships.map((championship) => loadFixture(championship.id))),
  ])
  const ctx = {
    timezone: club.timezone,
    today: localDateOf(now, club.timezone),
    courtName: new Map(courts.map((court) => [court.id, court.name])),
  }
  return championships.flatMap((championship, index) =>
    myMatchViews(championship, matchViews(championship, fixtures[index], ctx), profileId)
      .filter((match) => !isDone(match))
      .map((match) => ({ ...match, href: `/campeonatos/${championship.id}`, championshipName: championship.name })),
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: sin errores. Si supabase-js infiere otra forma para `members` o `sets` (por ejemplo, un objeto en vez de una lista), ajustar `GroupRow` o `MatchRow` en `lib/domain/championship-fixture.ts`; nunca castear el resultado.

- [ ] **Step 3: Commit**

```bash
git add lib/data/championship-fixture.ts
git commit -m "feat: read the fixture, the public page and the player's matches"
```

---

### Task 18: Acciones del organizador (`app/(club)/club/torneos/campeonatos/fixture-actions.ts`)

**Files:**
- Create: `app/(club)/club/torneos/campeonatos/fixture-actions.ts`
- Test: `tests/unit/lib/actions/championship-fixture-actions.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/actions/championship-fixture-actions.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INVALID_INPUT } from '@/lib/actions/result'
import type { Fixture } from '@/lib/domain/championship-fixture'
import { BRUNO, LUCIA, makeCategory, makeChampionship, makeEntry } from '../../fixtures/championships'
import { makeGroup, makeMatch, members, set } from '../../fixtures/championship-fixture'

// Server Actions are reachable by any POST: bad input must stop before any RPC.
type RpcResult = { data: unknown; error: { message: string } | null }
const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<RpcResult>>(async () => ({
  data: null,
  error: null,
}))
const loadChampionship = vi.fn()
const loadFixture = vi.fn<(championshipId: string) => Promise<Fixture>>()

vi.mock('server-only', () => ({}))
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
vi.mock('@/lib/auth/viewer', () => ({
  getViewer: async () => ({ userId: 'u1', club: { id: 'club-1', timezone: 'America/Montevideo' } }),
}))
vi.mock('@/lib/data/championships', () => ({ loadChampionship: (...args: unknown[]) => loadChampionship(...args) }))
vi.mock('@/lib/data/championship-fixture', () => ({ loadFixture: (id: string) => loadFixture(id) }))

const actions = await import('@/app/(club)/club/torneos/campeonatos/fixture-actions')

const ID = '11111111-1111-1111-1111-111111111111'
const MATCH = '33333333-3333-3333-3333-333333333333'
const COURT = '44444444-4444-4444-4444-444444444444'
const IDLE = { status: 'idle' as const }
const CHAMPIONSHIP = makeChampionship({
  categories: [
    makeCategory({ entries: [makeEntry({ id: 'e1' }), makeEntry({ id: 'e2', player1: BRUNO, player2: LUCIA })] }),
  ],
})

function form(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.append(key, value)
  return data
}

beforeEach(() => {
  rpc.mockClear()
  loadChampionship.mockReset()
  loadFixture.mockReset()
  loadChampionship.mockResolvedValue(CHAMPIONSHIP)
})

describe('the draw and the schedule', () => {
  it('draws the open categories and sends the draw to the database', async () => {
    expect(await actions.drawFixture(IDLE, form({ championshipId: 'nope' }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
    expect(await actions.drawFixture(IDLE, form({ championshipId: ID }))).toMatchObject({ status: 'ok' })
    expect(rpc).toHaveBeenCalledWith('save_championship_draw', {
      p_championship_id: ID,
      p_seed: expect.any(Number),
      p_draw: [expect.objectContaining({ category_id: 'k1' })],
    })
  })

  it('says which category cannot be drawn', async () => {
    loadChampionship.mockResolvedValue(makeChampionship({ categories: [makeCategory({ entries: [makeEntry()] })] }))
    expect(await actions.drawFixture(IDLE, form({ championshipId: ID }))).toEqual({
      status: 'error',
      message: '6ta Libre: Hacen falta al menos 2 parejas para sortear.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('schedules every match and sends the slots', async () => {
    loadFixture.mockResolvedValue({ groups: [makeGroup({ members: members(['e1', 'e2']) })], matches: [makeMatch()] })
    expect(await actions.scheduleFixture(IDLE, form({ championshipId: ID }))).toEqual({
      status: 'ok',
      message: 'Listo: el partido tiene cancha y horario.',
    })
    expect(rpc).toHaveBeenCalledWith('save_championship_schedule', {
      p_championship_id: ID,
      p_slots: [{ match_id: 'm1', court_id: 'court-1', starts_at: '2026-10-17T11:00:00.000Z' }],
    })
  })

  it('moves a match to the court and start chosen', async () => {
    await actions.moveMatch(IDLE, form({ matchId: MATCH, slot: `${COURT}|2026-10-17T14:00:00.000Z` }))
    expect(rpc).toHaveBeenCalledWith('set_match_slot', {
      p_match_id: MATCH,
      p_court_id: COURT,
      p_starts_at: '2026-10-17T14:00:00.000Z',
    })
  })

  it('publishes, giving back the free slots when asked', async () => {
    await actions.publishFixture(IDLE, form({ championshipId: ID, releaseFree: 'on' }))
    expect(rpc).toHaveBeenCalledWith('publish_championship', { p_championship_id: ID, p_release_free: true })
  })
})

describe('the tournament day', () => {
  it('rejects a score the rules do not allow, before any RPC', async () => {
    loadFixture.mockResolvedValue({ groups: [], matches: [makeMatch({ id: MATCH })] })
    expect(
      await actions.recordResult(IDLE, form({ championshipId: ID, matchId: MATCH, a1: '6', b1: '5', a2: '6', b2: '4' })),
    ).toEqual({ status: 'error', message: 'El set 1 no es un resultado posible: termina 6-0 a 6-4, 7-5 o 7-6.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('records a result and closes the group when it is complete', async () => {
    const group = makeGroup({ members: members(['e1', 'e2']) })
    loadFixture
      .mockResolvedValueOnce({ groups: [group], matches: [makeMatch({ id: MATCH })] })
      .mockResolvedValueOnce({
        groups: [group],
        matches: [makeMatch({ id: MATCH, status: 'finished', winner: 'e1', sets: [set(6, 3), set(6, 4)] })],
      })
    expect(
      await actions.recordResult(IDLE, form({ championshipId: ID, matchId: MATCH, a1: '6', b1: '3', a2: '6', b2: '4' })),
    ).toEqual({ status: 'ok', message: 'Resultado guardado. La zona terminó: los clasificados pasaron a la llave.' })
    expect(rpc).toHaveBeenNthCalledWith(1, 'record_match_result', { p_match_id: MATCH, p_sets: [[6, 3], [6, 4]] })
    expect(rpc).toHaveBeenNthCalledWith(2, 'close_championship_group', { p_group_id: 'g1', p_entry_ids: ['e1', 'e2'] })
  })

  it('closes a group in the order the organizer chose', async () => {
    const E1 = '55555555-5555-5555-5555-555555555551'
    const E2 = '55555555-5555-5555-5555-555555555552'
    await actions.closeGroup(IDLE, form({ groupId: ID, [`place:${E1}`]: '2', [`place:${E2}`]: '1' }))
    expect(rpc).toHaveBeenCalledWith('close_championship_group', { p_group_id: ID, p_entry_ids: [E2, E1] })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/actions/championship-fixture-actions.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/(club)/club/torneos/campeonatos/fixture-actions"`.

- [ ] **Step 3: Write minimal implementation**

`app/(club)/club/torneos/campeonatos/fixture-actions.ts`:
```ts
'use server'

import { failed, fromRpc, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
import { revalidateBookings } from '@/lib/actions/revalidate'
import { getViewer } from '@/lib/auth/viewer'
import { loadFixture } from '@/lib/data/championship-fixture'
import { loadChampionship } from '@/lib/data/championships'
import { drawCategories, drawChampionship, drawPayload } from '@/lib/domain/championship-draw'
import { readGroupOrderForm, readResultForm, readSeedsForm, readSlotForm } from '@/lib/domain/championship-fixture-form'
import { checkResult } from '@/lib/domain/championship-results'
import { scheduleChampionship, scheduleInput, schedulePayload } from '@/lib/domain/championship-schedule'
import { closingOrder, decisivePlaces } from '@/lib/domain/championship-standings'
import type { ChampionshipCategory } from '@/lib/domain/championships'
import { errorMessage } from '@/lib/domain/errors'
import { readBoolean, readUuid } from '@/lib/domain/input'
import { createClient } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createClient>>
type RpcCall = PromiseLike<{ error: { message: string } | null }>
type Closing = 'closed' | 'tied' | 'open'

const SESSION_EXPIRED = failed('Tu sesión venció. Volvé a ingresar.')
const NOT_FOUND = failed(errorMessage('not_found'))

// The database checks the caller is staff and every hard rule; these check the shape of what comes in and run
// the pure draw, schedule, result and table code.
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

// "Guardar cabezas de serie".
export async function saveSeeds(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = readSeedsForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const { categoryId, entryIds } = parsed.value
  return run(
    (supabase) => supabase.rpc('set_championship_seeds', { p_category_id: categoryId, p_entry_ids: entryIds }),
    'Cabezas de serie guardadas. Se usan en el próximo sorteo.',
  )
}

// "Sortear" / "Volver a sortear": a new seed every time.
export async function drawFixture(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return SESSION_EXPIRED
  const championshipId = readUuid(form, 'championshipId')
  if (!championshipId) return INVALID_INPUT
  const championship = await loadChampionship(viewer.club, championshipId)
  if (!championship) return NOT_FOUND
  const seed = Math.floor(Math.random() * 2_147_483_647)
  const draw = drawChampionship(drawCategories(championship), seed)
  if (!draw.ok) return failed(draw.message)
  return run(
    (supabase) =>
      supabase.rpc('save_championship_draw', {
        p_championship_id: championshipId,
        p_seed: seed,
        p_draw: drawPayload(draw.draws),
      }),
    'Sorteo listo. Revisá las zonas y las llaves y programá los partidos.',
  )
}

function scheduledText(placed: number, unplaced: number): string {
  if (unplaced > 0) {
    return `Ubicamos ${placed} ${placed === 1 ? 'partido' : 'partidos'}; ${unplaced} ${unplaced === 1 ? 'quedó' : 'quedaron'} sin lugar (abajo, con el motivo).`
  }
  return placed === 1 ? 'Listo: el partido tiene cancha y horario.' : `Listo: los ${placed} partidos tienen cancha y horario.`
}

// "Programar" / "Volver a programar": the pinned matches stay where they are.
export async function scheduleFixture(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer()
  if (!viewer) return SESSION_EXPIRED
  const championshipId = readUuid(form, 'championshipId')
  if (!championshipId) return INVALID_INPUT
  const [championship, fixture] = await Promise.all([
    loadChampionship(viewer.club, championshipId),
    loadFixture(championshipId),
  ])
  if (!championship) return NOT_FOUND
  if (fixture.matches.length === 0) return failed('Primero sorteá las zonas y las llaves.')
  const result = scheduleChampionship(scheduleInput(championship, fixture, viewer.club.timezone))
  return run(
    (supabase) =>
      supabase.rpc('save_championship_schedule', {
        p_championship_id: championshipId,
        p_slots: schedulePayload(result),
      }),
    scheduledText(fixture.matches.length - result.unplaced.length, result.unplaced.length),
  )
}

// "Mover": a court and a start from the options of the sheet (it also pins the match).
export async function moveMatch(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = readSlotForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const { matchId, courtId, startsAt } = parsed.value
  return run(
    (supabase) => supabase.rpc('set_match_slot', { p_match_id: matchId, p_court_id: courtId, p_starts_at: startsAt }),
    'Partido movido.',
  )
}

// "Fijar" / "Soltar".
export async function pinMatch(_previous: ActionState, form: FormData): Promise<ActionState> {
  const matchId = readUuid(form, 'matchId')
  const pinned = form.get('pinned')
  if (!matchId || (pinned !== 'true' && pinned !== 'false')) return INVALID_INPUT
  return run(
    (supabase) => supabase.rpc('set_match_pinned', { p_match_id: matchId, p_pinned: pinned === 'true' }),
    pinned === 'true' ? 'Partido fijado: "Volver a programar" no lo mueve.' : 'Partido suelto.',
  )
}

// "Publicar fixture", optionally giving back to the grid what the matches do not use.
export async function publishFixture(_previous: ActionState, form: FormData): Promise<ActionState> {
  const championshipId = readUuid(form, 'championshipId')
  if (!championshipId) return INVALID_INPUT
  return run(
    (supabase) =>
      supabase.rpc('publish_championship', {
        p_championship_id: championshipId,
        p_release_free: readBoolean(form, 'releaseFree'),
      }),
    'Fixture publicado. Les avisamos a las parejas y ya se puede compartir.',
  )
}

export async function startMatch(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onId(form, 'matchId', (supabase, id) => supabase.rpc('start_match', { p_match_id: id }), 'Partido en juego.')
}

// After a group result: when the group is complete and nothing level decides a place, it closes by itself and
// its places go to the bracket; a tie that decides one is the organizer's ("Cerrar zona").
async function closeIfComplete(
  supabase: Supabase,
  championshipId: string,
  groupId: string | null,
  category: Pick<ChampionshipCategory, 'format' | 'qualifiers'>,
): Promise<Closing> {
  if (!groupId) return 'open'
  const fixture = await loadFixture(championshipId)
  const group = fixture.groups.find((item) => item.id === groupId)
  if (!group) return 'open'
  const order = closingOrder(group, fixture.matches, decisivePlaces(category, group.members.length))
  if (!order.ok) return order.reason === 'tied' ? 'tied' : 'open'
  const { error } = await supabase.rpc('close_championship_group', { p_group_id: groupId, p_entry_ids: order.order })
  return error ? 'open' : 'closed'
}

function savedText(saved: string, closing: Closing): string {
  if (closing === 'closed') return `${saved} La zona terminó: los clasificados pasaron a la llave.`
  if (closing === 'tied') return `${saved} La zona terminó con un empate: ordenala con "Cerrar zona".`
  return saved
}

async function matchOf(championshipId: string, matchId: string) {
  const viewer = await getViewer()
  if (!viewer) return null
  const [championship, fixture] = await Promise.all([
    loadChampionship(viewer.club, championshipId),
    loadFixture(championshipId),
  ])
  const match = fixture.matches.find((item) => item.id === matchId)
  const category = championship?.categories.find((item) => item.id === match?.categoryId)
  return match && category ? { match, category } : null
}

// "Cargar resultado" (also to correct one).
export async function recordResult(_previous: ActionState, form: FormData): Promise<ActionState> {
  const championshipId = readUuid(form, 'championshipId')
  const parsed = readResultForm(form)
  if (!parsed.ok) return failed(parsed.message)
  if (!championshipId) return INVALID_INPUT
  const { matchId, sets } = parsed.value
  const found = await matchOf(championshipId, matchId)
  if (!found) return NOT_FOUND
  const check = checkResult(sets, found.category)
  if (!check.ok) return failed(check.message)
  const supabase = await createClient()
  const { error } = await supabase.rpc('record_match_result', { p_match_id: matchId, p_sets: sets })
  if (error) {
    revalidateBookings()
    return fromRpc(error, '')
  }
  const closing = await closeIfComplete(supabase, championshipId, found.match.groupId, found.category)
  revalidateBookings()
  return ok(savedText('Resultado guardado.', closing))
}

// "W.O.": the pair that did not show up.
export async function recordWalkover(_previous: ActionState, form: FormData): Promise<ActionState> {
  const championshipId = readUuid(form, 'championshipId')
  const matchId = readUuid(form, 'matchId')
  const absentId = readUuid(form, 'absentId')
  if (!championshipId || !matchId || !absentId) return INVALID_INPUT
  const found = await matchOf(championshipId, matchId)
  if (!found) return NOT_FOUND
  const supabase = await createClient()
  const { error } = await supabase.rpc('record_walkover', { p_match_id: matchId, p_absent_entry_id: absentId })
  if (error) {
    revalidateBookings()
    return fromRpc(error, '')
  }
  const closing = await closeIfComplete(supabase, championshipId, found.match.groupId, found.category)
  revalidateBookings()
  return ok(savedText('W.O. guardado.', closing))
}

// "Cerrar zona": the organizer's order (after a tie, the draw is theirs).
export async function closeGroup(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = readGroupOrderForm(form)
  if (!parsed.ok) return failed(parsed.message)
  const { groupId, entryIds } = parsed.value
  return run(
    (supabase) => supabase.rpc('close_championship_group', { p_group_id: groupId, p_entry_ids: entryIds }),
    'Zona cerrada: los clasificados pasaron a la llave.',
  )
}

export async function finishFixture(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onId(
    form,
    'championshipId',
    (supabase, id) => supabase.rpc('finish_championship', { p_championship_id: id }),
    'Campeonato finalizado.',
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run tests/unit/lib/actions/championship-fixture-actions.test.ts
npm run typecheck
npm run lint
```
Expected: PASS; typecheck y lint sin errores.

- [ ] **Step 5: Commit**

```bash
git add "app/(club)/club/torneos/campeonatos/fixture-actions.ts" tests/unit/lib/actions/championship-fixture-actions.test.ts
git commit -m "feat: organizer actions to draw, schedule, publish and record results"
```

---

## Corte 5: Pantallas del club

### Task 19: Compartir y la línea de un partido

**Files:**
- Create: `components/ui/share-button.tsx`
- Create: `components/championships/match-line.tsx`
- Create: `tests/unit/fixtures/championship-views.ts`
- Test: `tests/unit/components/ui/share-button.test.tsx`, `tests/unit/components/championships/match-line.test.tsx`

- [ ] **Step 1: Fixture de las vistas**

`tests/unit/fixtures/championship-views.ts`:
```ts
import type { MatchView, ZoneView } from '@/lib/domain/championship-views'

// Zona A of '6ta Libre': Ana and Pedro against Bruno and Lucía, today at 08:00 on Cancha 1, not started.
export function makeView(overrides: Partial<MatchView> = {}): MatchView {
  return {
    id: 'm1',
    categoryId: 'k1',
    categoryName: '6ta Libre',
    name: 'Zona A',
    stage: 'group',
    groupId: 'g1',
    round: null,
    position: null,
    sideA: 'Ana y Pedro',
    sideB: 'Bruno y Lucía',
    entryA: 'e1',
    entryB: 'e2',
    startsAt: new Date('2026-10-17T11:00:00Z'),
    date: '2026-10-17',
    day: 'Hoy',
    time: '08:00',
    court: 'Cancha 1',
    status: 'scheduled',
    statusLabel: 'Programado',
    score: null,
    winner: null,
    sets: [],
    pinned: false,
    ready: true,
    ...overrides,
  }
}

// Zona A, complete and not closed yet: Ana and Pedro first.
export function makeZone(overrides: Partial<ZoneView> = {}): ZoneView {
  return {
    id: 'g1',
    categoryId: 'k1',
    categoryName: '6ta Libre',
    name: 'Zona A',
    complete: true,
    closed: false,
    needsOrder: true,
    tiedNames: [],
    rows: [
      { entryId: 'e1', name: 'Ana y Pedro', played: 1, won: 1, lost: 0, sets: '2-0', games: '12-6' },
      { entryId: 'e2', name: 'Bruno y Lucía', played: 1, won: 0, lost: 1, sets: '0-2', games: '6-12' },
    ],
    ...overrides,
  }
}
```

- [ ] **Step 2: Write the failing tests**

`tests/unit/components/ui/share-button.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShareButton } from '@/components/ui/share-button'

const TEXT = 'Seguí el Campeonato de Primavera en vivo: https://rustic.uy/c/primavera-7k2f'

afterEach(() => {
  delete (navigator as { share?: unknown }).share
})

describe('ShareButton', () => {
  it('opens the phone\'s share sheet with the message', async () => {
    const share = vi.fn(async () => {})
    Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true })
    render(<ShareButton title="Campeonato de Primavera" text={TEXT} />)
    fireEvent.click(screen.getByRole('button', { name: 'Compartir' }))
    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: 'Campeonato de Primavera', text: TEXT }))
  })

  it('copies the message on a computer and says so', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ShareButton title="Campeonato de Primavera" text={TEXT} />)
    fireEvent.click(screen.getByRole('button', { name: 'Compartir' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Link copiado. Pegalo donde quieras.')
    expect(writeText).toHaveBeenCalledWith(TEXT)
  })
})
```

`tests/unit/components/championships/match-line.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MatchLine } from '@/components/championships/match-line'
import { makeView } from '../../fixtures/championship-views'

describe('MatchLine', () => {
  it('shows where and when, both sides, the score and the state, with the winner in bold', () => {
    render(
      <MatchLine
        match={makeView({ status: 'finished', statusLabel: 'Terminado', score: '6-3 6-4', winner: 'a' })}
        showCategory
      />,
    )
    expect(screen.getByText('6ta Libre · Zona A · Hoy 08:00 · Cancha 1')).toBeInTheDocument()
    expect(screen.getByText('Ana y Pedro')).toHaveClass('font-semibold')
    expect(screen.getByText('Bruno y Lucía')).not.toHaveClass('font-semibold')
    expect(screen.getByText('6-3 6-4 · Terminado')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/components/ui/share-button.test.tsx tests/unit/components/championships/match-line.test.tsx`
Expected: FAIL — no existen los componentes.

- [ ] **Step 4: Write minimal implementation**

`components/ui/share-button.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

// Design: "Compartir": the phone's share sheet when there is one; on a computer it copies the message (with the
// link) and says so.
export function ShareButton({ title, text, label = 'Compartir' }: { title: string; text: string; label?: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function share() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" onClick={share}>
        {label}
      </Button>
      {status === 'copied' ? (
        <p role="status" className="text-sm">
          Link copiado. Pegalo donde quieras.
        </p>
      ) : null}
      {status === 'failed' ? (
        <p role="alert" className="text-sm">
          No pudimos copiarlo. Copiá este mensaje: {text}
        </p>
      ) : null}
    </div>
  )
}
```

`components/championships/match-line.tsx`:
```tsx
import { cn } from '@/lib/cn'
import type { MatchView } from '@/lib/domain/championship-views'

// One match: where and when, both sides (the winner in bold), the score and its state. large: the TV mode.
export function MatchLine({
  match,
  showCategory = false,
  large = false,
}: {
  match: MatchView
  showCategory?: boolean
  large?: boolean
}) {
  const where = [
    showCategory ? match.categoryName : null,
    match.name,
    match.day && match.time ? `${match.day} ${match.time}` : null,
    match.court,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className={cn('flex flex-col gap-0.5', large && 'gap-2')}>
      <p className={cn('text-xs font-semibold uppercase tracking-wide text-fg-muted', large && 'text-xl')}>{where}</p>
      <p className={cn(match.winner === 'a' && 'font-semibold', large && 'text-3xl')}>{match.sideA}</p>
      <p className={cn(match.winner === 'b' && 'font-semibold', large && 'text-3xl')}>{match.sideB}</p>
      <p className={cn('text-sm', large && 'text-2xl')}>
        {match.score ? `${match.score} · ${match.statusLabel}` : match.statusLabel}
      </p>
    </div>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/components/ui/share-button.test.tsx tests/unit/components/championships/match-line.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/ui/share-button.tsx components/championships/match-line.tsx tests/unit/fixtures/championship-views.ts tests/unit/components/ui/share-button.test.tsx tests/unit/components/championships/match-line.test.tsx
git commit -m "feat: share button and the line of a championship match"
```

---

### Task 20: Cabezas de serie y los pasos del fixture

**Files:**
- Create: `components/championships/seeds-form.tsx`
- Create: `components/championships/fixture-steps.tsx`
- Test: `tests/unit/components/championships/seeds-form.test.tsx`, `tests/unit/components/championships/fixture-steps.test.tsx`

- [ ] **Step 1: Write the failing tests**

`tests/unit/components/championships/seeds-form.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SeedsForm } from '@/components/championships/seeds-form'
import type { FormAction } from '@/components/ui/action-form'

const ok = async () => ({ status: 'ok' as const, message: 'Cabezas de serie guardadas.' })

describe('SeedsForm', () => {
  it('numbers the pairs the organizer picks as seeds', async () => {
    const action = vi.fn<FormAction>(ok)
    render(
      <SeedsForm
        categoryId="k1"
        pairs={[
          { id: 'e2', name: 'Bruno y Lucía', levels: 'Declaran 4ª y 4ª (suma 8)', seed: 1 },
          { id: 'e1', name: 'Ana y Pedro', levels: 'Declaran 5ª y 6ª (suma 11)', seed: null },
        ]}
        action={action}
      />,
    )
    expect(screen.getByLabelText('Cabeza de serie de Bruno y Lucía')).toHaveValue('1')
    await userEvent.selectOptions(screen.getByLabelText('Cabeza de serie de Ana y Pedro'), '2')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cabezas de serie' }))
    await waitFor(() => expect(action).toHaveBeenCalled())
    const form = vi.mocked(action).mock.calls[0][1]
    expect(form.get('categoryId')).toBe('k1')
    expect(form.get('seed:e2')).toBe('1')
    expect(form.get('seed:e1')).toBe('2')
  })
})
```

`tests/unit/components/championships/fixture-steps.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FixtureSteps, type FixtureStepActions } from '@/components/championships/fixture-steps'
import type { FormAction } from '@/components/ui/action-form'

const ok = async () => ({ status: 'ok' as const, message: 'Listo.' })

function actions(): FixtureStepActions {
  return { draw: vi.fn<FormAction>(ok), schedule: vi.fn<FormAction>(ok), publish: vi.fn<FormAction>(ok), finish: vi.fn<FormAction>(ok) }
}

describe('FixtureSteps', () => {
  it('draws a championship with registration closed', async () => {
    const steps = actions()
    render(<FixtureSteps championshipId="ch1" status="closed" scheduled={0} unplaced={0} finishable={false} actions={steps} />)
    await userEvent.click(screen.getByRole('button', { name: 'Sortear' }))
    await waitFor(() => expect(steps.draw).toHaveBeenCalled())
    expect(vi.mocked(steps.draw).mock.calls[0][1].get('championshipId')).toBe('ch1')
  })

  it('schedules a drawn one, and does not publish while matches are left without a place', () => {
    render(<FixtureSteps championshipId="ch1" status="drawn" scheduled={20} unplaced={3} finishable={false} actions={actions()} />)
    expect(screen.getByText('3 partidos quedaron sin lugar: ubicalos a mano o volvé a programar.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Volver a programar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Volver a sortear' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Publicar fixture' })).not.toBeInTheDocument()
  })

  it('publishes when every match has a place, giving back the free slots if asked', async () => {
    const steps = actions()
    render(<FixtureSteps championshipId="ch1" status="drawn" scheduled={23} unplaced={0} finishable={false} actions={steps} />)
    await userEvent.click(screen.getByLabelText('Devolver a la grilla las franjas sin partidos'))
    await userEvent.click(screen.getByRole('button', { name: 'Publicar fixture' }))
    await waitFor(() => expect(steps.publish).toHaveBeenCalled())
    expect(vi.mocked(steps.publish).mock.calls[0][1].get('releaseFree')).toBe('on')
  })

  it('finishes a championship when everything is played', () => {
    render(<FixtureSteps championshipId="ch1" status="in_progress" scheduled={23} unplaced={0} finishable actions={actions()} />)
    expect(screen.getByRole('button', { name: 'Finalizar campeonato' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/components/championships/seeds-form.test.tsx tests/unit/components/championships/fixture-steps.test.tsx`
Expected: FAIL — no existen los componentes.

- [ ] **Step 3: Write minimal implementation**

`components/championships/seeds-form.tsx`:
```tsx
'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { inputClasses } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import type { SeedPair } from '@/lib/domain/championship-views'

// Design: "Cabezas de serie": the pairs strongest first (lowest sum of declared categories); the organizer numbers
// the ones to fix (1, 2...), one per group, before the draw.
export function SeedsForm({ categoryId, pairs, action }: { categoryId: string; pairs: SeedPair[]; action: FormAction }) {
  return (
    <ActionForm action={action} submitLabel="Guardar cabezas de serie" pendingLabel="Guardando…" variant="secondary">
      <input type="hidden" name="categoryId" value={categoryId} />
      <ul className="flex flex-col gap-2">
        {pairs.map((pair) => (
          <li key={pair.id} className="flex items-center justify-between gap-3">
            <span>
              <span className="block font-semibold">{pair.name}</span>
              <span className="block text-sm text-fg-muted">{pair.levels}</span>
            </span>
            <label htmlFor={`seed-${pair.id}`} className="sr-only">
              {`Cabeza de serie de ${pair.name}`}
            </label>
            <select
              id={`seed-${pair.id}`}
              name={`seed:${pair.id}`}
              defaultValue={pair.seed === null ? '' : String(pair.seed)}
              className={cn(inputClasses, 'w-24')}
            >
              <option value="">—</option>
              {pairs.map((_, index) => (
                <option key={index} value={String(index + 1)}>
                  {index + 1}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </ActionForm>
  )
}
```

`components/championships/fixture-steps.tsx`:
```tsx
'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import type { ChampionshipStatus } from '@/lib/domain/championships'

export type FixtureStepActions = { draw: FormAction; schedule: FormAction; publish: FormAction; finish: FormAction }

function unplacedText(count: number): string {
  return count === 1
    ? '1 partido quedó sin lugar: ubicalo a mano o volvé a programar.'
    : `${count} partidos quedaron sin lugar: ubicalos a mano o volvé a programar.`
}

// Design: the steps of the organizer: "Sortear", "Programar", "Publicar", and at the end "Finalizar"; only the
// ones that fit.
export function FixtureSteps({
  championshipId,
  status,
  scheduled,
  unplaced,
  finishable,
  actions,
}: {
  championshipId: string
  status: ChampionshipStatus
  scheduled: number
  unplaced: number
  finishable: boolean
  actions: FixtureStepActions
}) {
  const id = <input type="hidden" name="championshipId" value={championshipId} />

  if (status === 'closed') {
    return (
      <section aria-label="Sorteo" className="flex flex-col gap-3">
        <p className="text-sm text-fg-muted">
          Con la inscripción cerrada, sorteá las zonas y las llaves de todas las categorías. Hasta publicar, se puede
          volver a sortear.
        </p>
        <ActionForm action={actions.draw} submitLabel="Sortear" pendingLabel="Sorteando…">
          {id}
        </ActionForm>
      </section>
    )
  }

  if (status === 'drawn') {
    return (
      <section aria-label="Programación" className="flex flex-col gap-3">
        <p className="text-sm text-fg-muted">
          {scheduled === 0
            ? 'Programá todos los partidos en las canchas y horarios de los días de juego.'
            : unplaced > 0
              ? unplacedText(unplaced)
              : 'Todos los partidos tienen cancha y horario. Revisalos y publicá el fixture.'}
        </p>
        <ActionForm
          action={actions.schedule}
          submitLabel={scheduled === 0 ? 'Programar' : 'Volver a programar'}
          pendingLabel="Programando…"
          variant={scheduled === 0 ? 'primary' : 'secondary'}
        >
          {id}
        </ActionForm>
        {scheduled > 0 && unplaced === 0 ? (
          <ActionForm action={actions.publish} submitLabel="Publicar fixture" pendingLabel="Publicando…">
            {id}
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" name="releaseFree" className="size-5 accent-accent" />
              <span>Devolver a la grilla las franjas sin partidos</span>
            </label>
          </ActionForm>
        ) : null}
        <ActionForm action={actions.draw} submitLabel="Volver a sortear" pendingLabel="Sorteando…" variant="ghost">
          {id}
        </ActionForm>
      </section>
    )
  }

  if (status === 'in_progress' && finishable) {
    return (
      <section aria-label="Cierre" className="flex flex-col gap-3">
        <p className="text-sm text-fg-muted">Ya se jugaron todos los partidos y las finales.</p>
        <ActionForm action={actions.finish} submitLabel="Finalizar campeonato" pendingLabel="Finalizando…">
          {id}
        </ActionForm>
      </section>
    )
  }
  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/components/championships/seeds-form.test.tsx tests/unit/components/championships/fixture-steps.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/championships/seeds-form.tsx components/championships/fixture-steps.tsx tests/unit/components/championships/seeds-form.test.tsx tests/unit/components/championships/fixture-steps.test.tsx
git commit -m "feat: seeds form and the steps of the fixture"
```

---

### Task 21: Zonas y llaves

**Files:**
- Create: `components/championships/zones-view.tsx`
- Create: `components/championships/bracket-view.tsx`
- Test: `tests/unit/components/championships/zones-and-brackets.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/championships/zones-and-brackets.test.tsx`:
```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BracketView } from '@/components/championships/bracket-view'
import { ZonesView } from '@/components/championships/zones-view'
import { makeView, makeZone } from '../../fixtures/championship-views'

describe('ZonesView', () => {
  it('shows each group with its table, its ties and what goes below', () => {
    render(
      <ZonesView
        zones={[makeZone({ tiedNames: ['Ana y Pedro y Bruno y Lucía'] })]}
        footer={(zone) => <p>{`Cerrar ${zone.name}`}</p>}
      />,
    )
    const table = screen.getByRole('table', { name: 'Tabla de Zona A' })
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    expect(within(table).getByRole('row', { name: /1[.] Ana y Pedro/ })).toHaveTextContent('2-0')
    expect(screen.getByText('Empate a definir: Ana y Pedro y Bruno y Lucía.')).toBeInTheDocument()
    expect(screen.getByText('Cerrar Zona A')).toBeInTheDocument()
  })
})

describe('BracketView', () => {
  it('shows the rounds of a category with their matches', () => {
    render(
      <BracketView
        bracket={{
          categoryId: 'k1',
          categoryName: '6ta Libre',
          rounds: [
            {
              round: 2,
              name: 'Semifinal',
              matches: [makeView({ id: 's1', name: 'Semifinal 1', stage: 'knockout', sideA: '1° Zona A', sideB: '2° Zona B' })],
            },
            { round: 1, name: 'Final', matches: [makeView({ id: 'f', name: 'Final', stage: 'knockout', sideA: 'Ganador SF1', sideB: 'Ganador SF2' })] },
          ],
        }}
      />,
    )
    const bracket = screen.getByRole('region', { name: 'Llave de 6ta Libre' })
    expect(within(bracket).getByRole('heading', { name: 'Semifinal' })).toBeInTheDocument()
    expect(bracket).toHaveTextContent('1° Zona A')
    expect(bracket).toHaveTextContent('Ganador SF1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/championships/zones-and-brackets.test.tsx`
Expected: FAIL — no existen los componentes.

- [ ] **Step 3: Write minimal implementation**

`components/championships/zones-view.tsx`:
```tsx
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import type { ZoneView } from '@/lib/domain/championship-views'

// Design: "zonas con su tabla": played, won, sets and games; a tie the organizer decides; footer adds what the
// page needs under a group ("Cerrar zona").
export function ZonesView({ zones, footer }: { zones: ZoneView[]; footer?: (zone: ZoneView) => ReactNode }) {
  if (zones.length === 0) return null
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {zones.map((zone) => (
        <Card key={zone.id} className="flex flex-col gap-2">
          <h3 className="font-display text-xl font-bold uppercase">{zone.name}</h3>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{`Tabla de ${zone.name}`}</caption>
            <thead>
              <tr className="text-xs uppercase tracking-wide text-fg-muted">
                <th scope="col" className="py-1">Pareja</th>
                <th scope="col" className="py-1 text-right">PJ</th>
                <th scope="col" className="py-1 text-right">PG</th>
                <th scope="col" className="py-1 text-right">Sets</th>
                <th scope="col" className="py-1 text-right">Games</th>
              </tr>
            </thead>
            <tbody>
              {zone.rows.map((row, index) => (
                <tr key={row.entryId} className="border-t border-border">
                  <td className="py-1.5">{`${index + 1}. ${row.name}`}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.played}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.won}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.sets}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {zone.tiedNames.length > 0 ? (
            <p className="text-sm">{`Empate a definir: ${zone.tiedNames.join('; ')}.`}</p>
          ) : null}
          {footer ? footer(zone) : null}
        </Card>
      ))}
    </div>
  )
}
```

`components/championships/bracket-view.tsx`:
```tsx
import { MatchLine } from '@/components/championships/match-line'
import { cn } from '@/lib/cn'
import type { Bracket } from '@/lib/domain/championship-views'

// Design: "llaves": one column per round, first round first; large is the TV mode.
export function BracketView({ bracket, large = false }: { bracket: Bracket; large?: boolean }) {
  return (
    <section aria-label={`Llave de ${bracket.categoryName}`} className="flex flex-col gap-2">
      <h3 className={cn('font-display text-xl font-bold uppercase', large && 'text-4xl')}>{`Llave · ${bracket.categoryName}`}</h3>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {bracket.rounds.map((round) => (
          <div key={round.round} className={cn('flex min-w-56 flex-col justify-around gap-3', large && 'min-w-96')}>
            <h4 className={cn('text-xs font-semibold uppercase tracking-wide text-fg-muted', large && 'text-xl')}>{round.name}</h4>
            {round.matches.map((match) => (
              <div key={match.id} className="rounded-2xl border border-border bg-surface p-3">
                <MatchLine match={match} large={large} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/championships/zones-and-brackets.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/championships/zones-view.tsx components/championships/bracket-view.tsx tests/unit/components/championships/zones-and-brackets.test.tsx
git commit -m "feat: championship zones with their tables and brackets"
```

---

### Task 22: El fixture en tabla, lo no ubicado y mover un partido

**Files:**
- Create: `components/championships/fixture-table.tsx`
- Create: `components/championships/unplaced-list.tsx`
- Create: `components/championships/move-match-sheet.tsx`
- Test: `tests/unit/components/championships/fixture-table.test.tsx`, `tests/unit/components/championships/move-match-sheet.test.tsx`

- [ ] **Step 1: Write the failing tests**

`tests/unit/components/championships/fixture-table.test.tsx`:
```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FixtureTable } from '@/components/championships/fixture-table'
import { UnplacedList } from '@/components/championships/unplaced-list'
import type { FormAction } from '@/components/ui/action-form'
import { makeView } from '../../fixtures/championship-views'

const ok = async () => ({ status: 'ok' as const, message: 'Partido fijado.' })

describe('FixtureTable', () => {
  it('lists the matches with day, time, court, category and match, to edit or pin', async () => {
    const pin = vi.fn<FormAction>(ok)
    render(
      <FixtureTable
        matches={[makeView(), makeView({ id: 'm2', startsAt: null, date: null, day: null, time: null, court: null })]}
        basePath="/club/torneos/campeonatos/ch1"
        editable
        canPin
        pinAction={pin}
      />,
    )
    const table = screen.getByRole('table', { name: 'Fixture' })
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(within(table).getByRole('link', { name: 'Editar Zona A: Ana y Pedro vs Bruno y Lucía' })).toHaveAttribute(
      'href',
      '/club/torneos/campeonatos/ch1?partido=m1',
    )
    await userEvent.click(within(table).getByRole('button', { name: 'Fijar' }))
    await waitFor(() => expect(pin).toHaveBeenCalled())
    const form = vi.mocked(pin).mock.calls[0][1]
    expect(form.get('matchId')).toBe('m1')
    expect(form.get('pinned')).toBe('true')
  })
})

describe('UnplacedList', () => {
  it('says why each match has no place, with a way to place it by hand', () => {
    render(
      <UnplacedList
        items={[
          {
            id: 'm2',
            title: '6ta Libre · Final: 1° Zona A vs 2° Zona A',
            reason: 'No quedan canchas libres en los días de juego.',
            href: '/club/torneos/campeonatos/ch1?partido=m2',
          },
        ]}
      />,
    )
    expect(screen.getByRole('region', { name: 'Sin lugar' })).toHaveTextContent('No quedan canchas libres en los días de juego.')
    expect(screen.getByRole('link', { name: 'Ubicar a mano: 6ta Libre · Final: 1° Zona A vs 2° Zona A' })).toHaveAttribute(
      'href',
      '/club/torneos/campeonatos/ch1?partido=m2',
    )
  })
})
```

`tests/unit/components/championships/move-match-sheet.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MoveMatchSheet } from '@/components/championships/move-match-sheet'
import type { FormAction } from '@/components/ui/action-form'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const ok = async () => ({ status: 'ok' as const, message: 'Partido movido.' })
const OPTIONS = [
  { value: 'court-1|2026-10-17T12:30:00.000Z', label: 'Hoy 09:30 · Cancha 1' },
  { value: 'court-2|2026-10-17T12:30:00.000Z', label: 'Hoy 09:30 · Cancha 2' },
]

beforeEach(() => push.mockClear())

describe('MoveMatchSheet', () => {
  it('moves a match to one of the valid courts and times, and goes back to the fixture', async () => {
    const move = vi.fn<FormAction>(ok)
    render(<MoveMatchSheet matchId="m1" title="6ta Libre · Zona A" options={OPTIONS} closeHref="/club/torneos/campeonatos/ch1" action={move} />)
    const sheet = screen.getByRole('dialog', { name: 'Mover partido' })
    await userEvent.selectOptions(screen.getByLabelText('Cancha y horario'), 'court-2|2026-10-17T12:30:00.000Z')
    await userEvent.click(screen.getByRole('button', { name: 'Mover' }))
    await waitFor(() => expect(move).toHaveBeenCalled())
    const form = vi.mocked(move).mock.calls[0][1]
    expect(form.get('matchId')).toBe('m1')
    expect(form.get('slot')).toBe('court-2|2026-10-17T12:30:00.000Z')
    await waitFor(() => expect(push).toHaveBeenCalledWith('/club/torneos/campeonatos/ch1'))
    expect(sheet).toBeInTheDocument()
  })

  it('says when there is nowhere else to put it', () => {
    render(<MoveMatchSheet matchId="m1" title="6ta Libre · Zona A" options={[]} closeHref="/x" action={vi.fn<FormAction>(ok)} />)
    expect(screen.getByText('No hay otra cancha ni horario donde entre este partido.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/components/championships/fixture-table.test.tsx tests/unit/components/championships/move-match-sheet.test.tsx`
Expected: FAIL — no existen los componentes.

- [ ] **Step 3: Write minimal implementation**

`components/championships/fixture-table.tsx`:
```tsx
'use client'

import Link from 'next/link'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { buttonClasses } from '@/components/ui/button'
import { DataTable, type DataColumn, type DataRow } from '@/components/ui/data-table'
import type { MatchView } from '@/lib/domain/championship-views'

const COLUMNS: DataColumn[] = [
  { key: 'day', label: 'Día', sortable: true },
  { key: 'time', label: 'Hora', sortable: true },
  { key: 'court', label: 'Cancha', sortable: true },
  { key: 'category', label: 'Categoría', sortable: true },
  { key: 'match', label: 'Partido' },
  { key: 'status', label: 'Estado' },
  { key: 'actions', label: 'Acciones', hideLabel: true },
]

// Design: "el fixture en tabla (día, hora, cancha, categoría, partido)", with "Editar" (another court and time)
// and, before publishing, "Fijar". The matches without a place are listed apart (UnplacedList).
export function FixtureTable({
  matches,
  basePath,
  editable,
  canPin,
  pinAction,
}: {
  matches: MatchView[]
  basePath: string
  editable: boolean
  canPin: boolean
  pinAction: FormAction
}) {
  const placed = matches.filter((match) => match.startsAt !== null)
  const rows: DataRow[] = placed.map((match) => ({
    id: match.id,
    search: `${match.sideA} ${match.sideB} ${match.categoryName} ${match.name}`,
    sort: {
      day: match.startsAt?.getTime() ?? 0,
      time: match.startsAt?.getTime() ?? 0,
      court: match.court ?? '',
      category: match.categoryName,
    },
    filters: { category: match.categoryId, day: match.date ?? '' },
    cells: {
      day: match.day,
      time: match.time,
      court: match.court,
      category: match.categoryName,
      match: (
        <span>
          <span className="block font-semibold">{match.name}</span>
          <span className="block text-sm">{`${match.sideA} vs ${match.sideB}`}</span>
        </span>
      ),
      status: [match.statusLabel, match.score, match.pinned ? 'Fijado' : null].filter(Boolean).join(' · '),
      actions: (
        <div className="flex flex-wrap justify-end gap-2">
          {editable && match.status === 'scheduled' ? (
            <Link
              href={`${basePath}?partido=${match.id}`}
              aria-label={`Editar ${match.name}: ${match.sideA} vs ${match.sideB}`}
              className={buttonClasses({ variant: 'secondary' })}
            >
              Editar
            </Link>
          ) : null}
          {canPin ? (
            <ActionForm action={pinAction} submitLabel={match.pinned ? 'Soltar' : 'Fijar'} pendingLabel="Guardando…" variant="ghost">
              <input type="hidden" name="matchId" value={match.id} />
              <input type="hidden" name="pinned" value={match.pinned ? 'false' : 'true'} />
            </ActionForm>
          ) : null}
        </div>
      ),
    },
  }))
  const categories = [...new Map(placed.map((match) => [match.categoryId, match.categoryName])).entries()]
  const days = [...new Map(placed.map((match) => [match.date ?? '', match.day ?? ''])).entries()]

  return (
    <DataTable
      caption="Fixture"
      columns={COLUMNS}
      rows={rows}
      filters={[
        { key: 'category', label: 'Categoría', options: categories.map(([value, label]) => ({ value, label })) },
        { key: 'day', label: 'Día', options: days.map(([value, label]) => ({ value, label })) },
      ]}
      searchLabel="Buscar pareja"
      searchPlaceholder="Nombre de un jugador"
      initialSort={{ key: 'day', dir: 'asc' }}
      pageSize={50}
      emptyText="Todavía no hay partidos programados."
    />
  )
}
```

`components/championships/unplaced-list.tsx`:
```tsx
import Link from 'next/link'

export type UnplacedItem = { id: string; title: string; reason: string; href: string }

// Design: "lo no ubicado con motivo", each with a way to place it by hand.
export function UnplacedList({ items }: { items: UnplacedItem[] }) {
  return (
    <section aria-labelledby="sin-lugar" className="flex flex-col gap-2 rounded-2xl border border-accent p-4">
      <h3 id="sin-lugar" className="font-display text-xl font-bold uppercase">
        Sin lugar
      </h3>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-1">
            <span className="font-semibold">{item.title}</span>
            <span className="text-sm">{item.reason}</span>
            <Link
              href={item.href}
              aria-label={`Ubicar a mano: ${item.title}`}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-ink underline"
            >
              Ubicar a mano
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

`components/championships/move-match-sheet.tsx`:
```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Field, inputClasses } from '@/components/ui/field'

export type SlotChoice = { value: string; label: string }

// Design: "Mover un partido": another court and time from the valid options (the page computes them for
// ?partido=<id>); closing goes back to the fixture.
export function MoveMatchSheet({
  matchId,
  title,
  options,
  closeHref,
  action,
}: {
  matchId: string
  title: string
  options: SlotChoice[]
  closeHref: string
  action: FormAction
}) {
  const router = useRouter()
  const close = useCallback(() => router.push(closeHref), [router, closeHref])

  return (
    <BottomSheet open onClose={close} title="Mover partido">
      <p className="mb-3">{title}</p>
      {options.length === 0 ? (
        <p>No hay otra cancha ni horario donde entre este partido.</p>
      ) : (
        <ActionForm action={action} submitLabel="Mover" pendingLabel="Moviendo…" onDone={close}>
          <input type="hidden" name="matchId" value={matchId} />
          <Field label="Cancha y horario" htmlFor="move-slot">
            <select id="move-slot" name="slot" defaultValue={options[0].value} className={inputClasses}>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </ActionForm>
      )}
    </BottomSheet>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/components/championships/fixture-table.test.tsx tests/unit/components/championships/move-match-sheet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/championships/fixture-table.tsx components/championships/unplaced-list.tsx components/championships/move-match-sheet.tsx tests/unit/components/championships/fixture-table.test.tsx tests/unit/components/championships/move-match-sheet.test.tsx
git commit -m "feat: fixture table, matches without a place and moving a match"
```

---

### Task 23: El día del torneo (resultados, W.O. y cierre de zona)

**Files:**
- Create: `components/championships/result-sheet.tsx`
- Create: `components/championships/walkover-sheet.tsx`
- Create: `components/championships/match-day-board.tsx`
- Create: `components/championships/group-order-form.tsx`
- Test: `tests/unit/components/championships/match-day-board.test.tsx`, `tests/unit/components/championships/group-order-form.test.tsx`

- [ ] **Step 1: Write the failing tests**

`tests/unit/components/championships/match-day-board.test.tsx`:
```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MatchDayBoard, type DayBoardActions } from '@/components/championships/match-day-board'
import type { FormAction } from '@/components/ui/action-form'
import { makeView } from '../../fixtures/championship-views'

const ok = async () => ({ status: 'ok' as const, message: 'Listo.' })
const RULES = { k1: { thirdSet: 'super_tiebreak' as const, timeLimit: null } }

function actions(): DayBoardActions {
  return { start: vi.fn<FormAction>(ok), result: vi.fn<FormAction>(ok), walkover: vi.fn<FormAction>(ok) }
}

describe('MatchDayBoard', () => {
  it('starts a match whose pairs are known, and lets the others wait', async () => {
    const steps = actions()
    render(
      <MatchDayBoard
        championshipId="ch1"
        playing={[]}
        upcoming={[
          makeView(),
          makeView({ id: 'f', name: 'Final', ready: false, entryA: null, entryB: null, sideA: '1° Zona A', sideB: '2° Zona A' }),
        ]}
        finished={[]}
        rules={RULES}
        actions={steps}
      />,
    )
    const upcoming = screen.getByRole('region', { name: 'Próximos' })
    expect(within(upcoming).getByText('Espera a sus parejas.')).toBeInTheDocument()
    await userEvent.click(within(upcoming).getByRole('button', { name: 'Empezar' }))
    await waitFor(() => expect(steps.start).toHaveBeenCalled())
    expect(vi.mocked(steps.start).mock.calls[0][1].get('matchId')).toBe('m1')
    expect(await screen.findByRole('status')).toHaveTextContent('Listo.')
  })

  it('records a result set by set', async () => {
    const steps = actions()
    render(
      <MatchDayBoard
        championshipId="ch1"
        playing={[makeView({ status: 'playing', statusLabel: 'En juego' })]}
        upcoming={[]}
        finished={[]}
        rules={RULES}
        actions={steps}
      />,
    )
    await userEvent.click(
      within(screen.getByRole('region', { name: 'En juego ahora' })).getByRole('button', { name: 'Cargar resultado' }),
    )
    const sheet = screen.getByRole('dialog', { name: 'Cargar resultado' })
    expect(
      within(sheet).getByText('Al mejor de 3 sets, con tie-break en 6-6. El tercer set es un súper tie-break a 10.'),
    ).toBeInTheDocument()
    await userEvent.type(within(sheet).getByLabelText('Set 1 · Ana y Pedro'), '6')
    await userEvent.type(within(sheet).getByLabelText('Set 1 · Bruno y Lucía'), '3')
    await userEvent.type(within(sheet).getByLabelText('Set 2 · Ana y Pedro'), '6')
    await userEvent.type(within(sheet).getByLabelText('Set 2 · Bruno y Lucía'), '4')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Guardar resultado' }))
    await waitFor(() => expect(steps.result).toHaveBeenCalled())
    const form = vi.mocked(steps.result).mock.calls[0][1]
    expect(['championshipId', 'matchId', 'a1', 'b1', 'a2', 'b2', 'a3'].map((key) => form.get(key))).toEqual([
      'ch1',
      'm1',
      '6',
      '3',
      '6',
      '4',
      '',
    ])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('records a W.O. for the pair that did not show up', async () => {
    const steps = actions()
    render(<MatchDayBoard championshipId="ch1" playing={[]} upcoming={[makeView()]} finished={[]} rules={RULES} actions={steps} />)
    await userEvent.click(screen.getByRole('button', { name: 'W.O.' }))
    const sheet = screen.getByRole('dialog', { name: 'W.O.' })
    await userEvent.click(within(sheet).getByLabelText('Bruno y Lucía'))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Guardar W.O.' }))
    await waitFor(() => expect(steps.walkover).toHaveBeenCalled())
    expect(vi.mocked(steps.walkover).mock.calls[0][1].get('absentId')).toBe('e2')
  })

  it('corrects a result already saved, starting from its sets', async () => {
    render(
      <MatchDayBoard
        championshipId="ch1"
        playing={[]}
        upcoming={[]}
        finished={[
          makeView({
            status: 'finished',
            statusLabel: 'Terminado',
            score: '6-3 6-4',
            winner: 'a',
            sets: [
              { a: 6, b: 3, superTiebreak: false },
              { a: 6, b: 4, superTiebreak: false },
            ],
          }),
        ]}
        rules={RULES}
        actions={actions()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Corregir' }))
    expect(screen.getByLabelText('Set 2 · Bruno y Lucía')).toHaveValue(4)
  })
})
```

`tests/unit/components/championships/group-order-form.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GroupOrderForm } from '@/components/championships/group-order-form'
import type { FormAction } from '@/components/ui/action-form'

const ok = async () => ({ status: 'ok' as const, message: 'Zona cerrada.' })

describe('GroupOrderForm', () => {
  it('closes a group in the order the organizer chose after a tie', async () => {
    const action = vi.fn<FormAction>(ok)
    render(
      <GroupOrderForm
        groupId="g1"
        rows={[
          { entryId: 'e1', name: 'Ana y Pedro' },
          { entryId: 'e2', name: 'Bruno y Lucía' },
        ]}
        tiedNames={['Ana y Pedro y Bruno y Lucía']}
        action={action}
      />,
    )
    expect(
      screen.getByText('Hay un empate que decide el organizador (por sorteo): ordená la zona y cerrala.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Puesto de Ana y Pedro')).toHaveValue('1')
    await userEvent.selectOptions(screen.getByLabelText('Puesto de Ana y Pedro'), '2')
    await userEvent.selectOptions(screen.getByLabelText('Puesto de Bruno y Lucía'), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar zona' }))
    await waitFor(() => expect(action).toHaveBeenCalled())
    const form = vi.mocked(action).mock.calls[0][1]
    expect(['groupId', 'place:e1', 'place:e2'].map((key) => form.get(key))).toEqual(['g1', '2', '1'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/components/championships/match-day-board.test.tsx tests/unit/components/championships/group-order-form.test.tsx`
Expected: FAIL — no existen los componentes.

- [ ] **Step 3: Write minimal implementation**

`components/championships/result-sheet.tsx`:
```tsx
'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { inputClasses } from '@/components/ui/field'
import type { MatchRules } from '@/lib/domain/championship-results'
import type { MatchView } from '@/lib/domain/championship-views'

const SETS = [1, 2, 3]

function rulesText(rules: MatchRules): string {
  const third = rules.thirdSet === 'super_tiebreak' ? ' El tercer set es un súper tie-break a 10.' : ''
  return rules.timeLimit === null
    ? `Al mejor de 3 sets, con tie-break en 6-6.${third}`
    : `${rules.timeLimit} minutos de juego: si se termina el tiempo, cargá el marcador como quedó.${third}`
}

// Design: "Cargar resultado": the games of each pair per set, checked against the category's rules (the action
// says what is wrong). It also corrects a result: the sheet starts with the sets saved.
export function ResultSheet({
  championshipId,
  match,
  rules,
  action,
  onClose,
  onDone,
}: {
  championshipId: string
  match: MatchView
  rules: MatchRules
  action: FormAction
  onClose: () => void
  onDone: (message: string) => void
}) {
  return (
    <BottomSheet open onClose={onClose} title="Cargar resultado">
      <p className="font-semibold">{`${match.categoryName} · ${match.name}`}</p>
      <p className="mb-3 text-sm text-fg-muted">{rulesText(rules)}</p>
      <ActionForm action={action} submitLabel="Guardar resultado" pendingLabel="Guardando…" onDone={onDone}>
        <input type="hidden" name="championshipId" value={championshipId} />
        <input type="hidden" name="matchId" value={match.id} />
        {SETS.map((number) => (
          <fieldset key={number} className="flex flex-col gap-2">
            <legend className="text-sm font-semibold">
              {number === 3 && rules.thirdSet === 'super_tiebreak' ? 'Set 3 (súper tie-break)' : `Set ${number}`}
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {(['a', 'b'] as const).map((side) => {
                const name = side === 'a' ? match.sideA : match.sideB
                const saved = match.sets[number - 1]
                return (
                  <label key={side} className="flex flex-col gap-1 text-sm">
                    <span>{name}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={99}
                      name={`${side}${number}`}
                      aria-label={`Set ${number} · ${name}`}
                      defaultValue={saved ? String(side === 'a' ? saved.a : saved.b) : ''}
                      className={inputClasses}
                    />
                  </label>
                )
              })}
            </div>
          </fieldset>
        ))}
      </ActionForm>
    </BottomSheet>
  )
}
```

`components/championships/walkover-sheet.tsx`:
```tsx
'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import type { MatchView } from '@/lib/domain/championship-views'

// Design: "W.O.": the pair that did not show up loses 6-0 6-0.
export function WalkoverSheet({
  championshipId,
  match,
  action,
  onClose,
  onDone,
}: {
  championshipId: string
  match: MatchView
  action: FormAction
  onClose: () => void
  onDone: (message: string) => void
}) {
  const sides = [
    { entryId: match.entryA, name: match.sideA },
    { entryId: match.entryB, name: match.sideB },
  ]
  return (
    <BottomSheet open onClose={onClose} title="W.O.">
      <p className="mb-3">{`${match.categoryName} · ${match.name}: la pareja que no se presentó pierde 6-0 6-0.`}</p>
      <ActionForm action={action} submitLabel="Guardar W.O." pendingLabel="Guardando…" variant="danger" onDone={onDone}>
        <input type="hidden" name="championshipId" value={championshipId} />
        <input type="hidden" name="matchId" value={match.id} />
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">¿Quién no se presentó?</legend>
          {sides.map((side) =>
            side.entryId ? (
              <label key={side.entryId} className="flex min-h-11 items-center gap-3">
                <input type="radio" name="absentId" value={side.entryId} required className="size-5 accent-accent" />
                <span>{side.name}</span>
              </label>
            ) : null,
          )}
        </fieldset>
      </ActionForm>
    </BottomSheet>
  )
}
```

`components/championships/match-day-board.tsx`:
```tsx
'use client'

import { useCallback, useId, useState, type ReactNode } from 'react'
import { MatchLine } from '@/components/championships/match-line'
import { ResultSheet } from '@/components/championships/result-sheet'
import { WalkoverSheet } from '@/components/championships/walkover-sheet'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import type { MatchRules } from '@/lib/domain/championship-results'
import type { MatchView } from '@/lib/domain/championship-views'

export type DayBoardActions = { start: FormAction; result: FormAction; walkover: FormAction }
type Sheet = { kind: 'result' | 'walkover'; match: MatchView }

const DEFAULT_RULES: MatchRules = { thirdSet: 'super_tiebreak', timeLimit: null }

// Design: "Día del torneo": "En juego ahora" and "Próximos" with "Empezar", "Cargar resultado" and "W.O.", and
// the last ones played, to correct a result.
export function MatchDayBoard({
  championshipId,
  playing,
  upcoming,
  finished,
  rules,
  actions,
}: {
  championshipId: string
  playing: MatchView[]
  upcoming: MatchView[]
  finished: MatchView[]
  // Category id → its rules (the result sheet explains them).
  rules: Record<string, MatchRules>
  actions: DayBoardActions
}) {
  const id = useId()
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const close = useCallback(() => setSheet(null), [])
  const done = useCallback((message: string) => {
    setSheet(null)
    setNotice(message)
  }, [])

  const list = (key: string, title: string, matches: MatchView[], empty: string, buttons: (match: MatchView) => ReactNode) => (
    <section aria-labelledby={`${id}-${key}`} className="flex flex-col gap-2">
      <h3 id={`${id}-${key}`} className="font-display text-xl font-bold uppercase">
        {title}
      </h3>
      {matches.length === 0 ? (
        <p className="text-fg-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {matches.map((match) => (
            <li
              key={match.id}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 md:flex-row md:items-center md:justify-between"
            >
              <MatchLine match={match} showCategory />
              <div className="flex flex-wrap items-center gap-2">{buttons(match)}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
  const resultButtons = (match: MatchView) => (
    <>
      <Button variant="secondary" onClick={() => setSheet({ kind: 'result', match })}>
        Cargar resultado
      </Button>
      <Button variant="ghost" onClick={() => setSheet({ kind: 'walkover', match })}>
        W.O.
      </Button>
    </>
  )

  return (
    <div className="flex flex-col gap-4">
      {notice ? <p role="status">{notice}</p> : null}
      {list('playing', 'En juego ahora', playing, 'No hay partidos en juego.', resultButtons)}
      {list('upcoming', 'Próximos', upcoming, 'No quedan partidos por jugar.', (match) =>
        match.ready ? (
          <>
            <ActionForm action={actions.start} submitLabel="Empezar" pendingLabel="Empezando…" onDone={setNotice}>
              <input type="hidden" name="matchId" value={match.id} />
            </ActionForm>
            {resultButtons(match)}
          </>
        ) : (
          <p className="text-sm text-fg-muted">Espera a sus parejas.</p>
        ),
      )}
      {list('finished', 'Terminados', finished, 'Todavía no hay resultados.', (match) => (
        <Button variant="ghost" onClick={() => setSheet({ kind: 'result', match })}>
          Corregir
        </Button>
      ))}
      {sheet?.kind === 'result' ? (
        <ResultSheet
          championshipId={championshipId}
          match={sheet.match}
          rules={rules[sheet.match.categoryId] ?? DEFAULT_RULES}
          action={actions.result}
          onClose={close}
          onDone={done}
        />
      ) : null}
      {sheet?.kind === 'walkover' ? (
        <WalkoverSheet championshipId={championshipId} match={sheet.match} action={actions.walkover} onClose={close} onDone={done} />
      ) : null}
    </div>
  )
}
```

`components/championships/group-order-form.tsx`:
```tsx
'use client'

import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { inputClasses } from '@/components/ui/field'
import { cn } from '@/lib/cn'

// Design: "si persiste, sorteo del organizador desde la app": a complete group that did not close by itself is
// ordered here (it starts in the order of its table) and closed; its places go to the bracket.
export function GroupOrderForm({
  groupId,
  rows,
  tiedNames,
  action,
}: {
  groupId: string
  rows: { entryId: string; name: string }[]
  tiedNames: string[]
  action: FormAction
}) {
  return (
    <ActionForm action={action} submitLabel="Cerrar zona" pendingLabel="Cerrando…" variant="secondary">
      <p className="text-sm">
        {tiedNames.length > 0
          ? 'Hay un empate que decide el organizador (por sorteo): ordená la zona y cerrala.'
          : 'Todos sus partidos tienen resultado: revisá el orden y cerrá la zona.'}
      </p>
      <input type="hidden" name="groupId" value={groupId} />
      {rows.map((row, index) => (
        <div key={row.entryId} className="flex items-center justify-between gap-3">
          <label htmlFor={`place-${groupId}-${row.entryId}`} className="text-sm">
            {`Puesto de ${row.name}`}
          </label>
          <select
            id={`place-${groupId}-${row.entryId}`}
            name={`place:${row.entryId}`}
            defaultValue={String(index + 1)}
            className={cn(inputClasses, 'w-20')}
          >
            {rows.map((_, place) => (
              <option key={place} value={String(place + 1)}>
                {place + 1}
              </option>
            ))}
          </select>
        </div>
      ))}
    </ActionForm>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/components/championships/match-day-board.test.tsx tests/unit/components/championships/group-order-form.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/championships/result-sheet.tsx components/championships/walkover-sheet.tsx components/championships/match-day-board.tsx components/championships/group-order-form.tsx tests/unit/components/championships/match-day-board.test.tsx tests/unit/components/championships/group-order-form.test.tsx
git commit -m "feat: tournament day board with results, walkovers and closing a group"
```

---

### Task 24: La página de gestión del campeonato

**Files:**
- Modify: `app/(club)/club/torneos/campeonatos/[id]/page.tsx`

- [ ] **Step 1: Imports** (# no unit test — página de servidor; la cubren typecheck, el e2e de la Task 29 y los tests de cada componente)

In `app/(club)/club/torneos/campeonatos/[id]/page.tsx`, replace:
```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
```
with:
```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BracketView } from '@/components/championships/bracket-view'
import { FixtureSteps } from '@/components/championships/fixture-steps'
import { FixtureTable } from '@/components/championships/fixture-table'
import { GroupOrderForm } from '@/components/championships/group-order-form'
import { MatchDayBoard } from '@/components/championships/match-day-board'
import { MoveMatchSheet } from '@/components/championships/move-match-sheet'
import { SeedsForm } from '@/components/championships/seeds-form'
import { UnplacedList } from '@/components/championships/unplaced-list'
import { ZonesView } from '@/components/championships/zones-view'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { buttonClasses } from '@/components/ui/button'
import { ShareButton } from '@/components/ui/share-button'
import { getSiteUrl } from '@/lib/auth/redirect'
import { loadFixture } from '@/lib/data/championship-fixture'
import { EMPTY_FIXTURE } from '@/lib/domain/championship-fixture'
import { scheduleInput, slotOptions, unplacedReasons } from '@/lib/domain/championship-schedule'
import {
  brackets,
  championshipShareText,
  dayBoard,
  finishable,
  matchViews,
  seedPairs,
  zoneViews,
} from '@/lib/domain/championship-views'
import {
  closeGroup,
  drawFixture,
  finishFixture,
  moveMatch,
  pinMatch,
  publishFixture,
  recordResult,
  recordWalkover,
  saveSeeds,
  scheduleFixture,
  startMatch,
} from '../fixture-actions'
```

In `app/(club)/club/torneos/campeonatos/[id]/page.tsx`, replace:
```tsx
import {
  categoryDetail,
  matchRulesText,
```
with:
```tsx
import {
  activeEntries,
  categoryDetail,
  matchRulesText,
```

In `app/(club)/club/torneos/campeonatos/[id]/page.tsx`, replace:
```tsx
import { timeIn } from '@/lib/domain/format'
```
with:
```tsx
import { dayLabel, timeIn } from '@/lib/domain/format'
```

- [ ] **Step 2: `?partido=` y lo que la página calcula del fixture**

In `app/(club)/club/torneos/campeonatos/[id]/page.tsx`, replace:
```tsx
type Params = Promise<{ id: string }>

// A draft is edited here (days of play and categories); from the opening of registration on, the same page
// manages the pairs.
export default async function ManageChampionshipPage({ params }: { params: Params }) {
  const { id } = await params
```
with:
```tsx
type Params = Promise<{ id: string }>
type SearchParams = Promise<{ partido?: string }>

// A draft is edited here (days of play and categories); from the opening of registration on, the same page
// manages the pairs; with registration closed, the seeds, the draw, the schedule and the tournament day.
// ?partido=<id> opens "Mover partido" with the courts and times where it fits.
export default async function ManageChampionshipPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  const { id } = await params
  const { partido } = await searchParams
```

In `app/(club)/club/torneos/campeonatos/[id]/page.tsx`, replace:
```tsx
  const deadline = championship.status === 'registration' ? closesText(championship, club.timezone) : null
```
with:
```tsx
  const deadline = championship.status === 'registration' ? closesText(championship, club.timezone) : null
  const showsFixture = ['drawn', 'published', 'in_progress', 'finished'].includes(championship.status)
  const fixture = showsFixture ? await loadFixture(championship.id) : EMPTY_FIXTURE
  const views = matchViews(championship, fixture, { timezone: club.timezone, today, courtName })
  const board = dayBoard(views)
  const live = championship.status === 'published' || championship.status === 'in_progress'
  const movable = championship.status === 'drawn' || live
  const input = movable ? scheduleInput(championship, fixture, club.timezone) : null
  const pagePath = `/club/torneos/campeonatos/${championship.id}`
  const unplaced =
    championship.status === 'drawn' && input
      ? unplacedReasons(input).map((item) => {
          const view = views.find((match) => match.id === item.matchId)
          return {
            id: item.matchId,
            title: view ? `${view.categoryName} · ${view.name}: ${view.sideA} vs ${view.sideB}` : 'Partido',
            reason: item.reason,
            href: `${pagePath}?partido=${item.matchId}`,
          }
        })
      : []
  const moving =
    input && partido ? (views.find((match) => match.id === partido && match.status === 'scheduled') ?? null) : null
  const moveOptions =
    moving && input
      ? slotOptions(input, moving.id).map((option) => ({
          value: `${option.courtId}|${option.startsAt.toISOString()}`,
          label: `${dayLabel(localDateOf(option.startsAt, club.timezone), today)} ${timeIn(option.startsAt, club.timezone)} · ${courtName.get(option.courtId) ?? 'Cancha'}`,
        }))
      : []
  const rules = Object.fromEntries(
    championship.categories.map((category) => [category.id, { thirdSet: category.thirdSet, timeLimit: category.timeLimit }]),
  )
  const shareUrl = championship.publicCode ? `${getSiteUrl()}/c/${championship.publicCode}` : null
```

- [ ] **Step 3: Las secciones del fixture**

In `app/(club)/club/torneos/campeonatos/[id]/page.tsx`, replace:
```tsx
      {!draft ? (
        <PairsBoard
```
with:
```tsx
      {championship.status === 'closed' ? (
        <section aria-labelledby="cabezas" className="flex flex-col gap-3">
          <h2 id="cabezas" className="font-display text-2xl font-bold uppercase">
            Cabezas de serie
          </h2>
          <p className="text-sm text-fg-muted">
            Las parejas van por la suma de las categorías que declararon (menor primero). Numerá las que quieras fijar:
            van una por zona.
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {openCategories(championship)
              .filter((category) => activeEntries(category).length >= 2)
              .map((category) => (
                <Card key={category.id} className="flex flex-col gap-2">
                  <h3 className="font-display text-xl font-bold uppercase">{category.name}</h3>
                  <SeedsForm categoryId={category.id} pairs={seedPairs(category)} action={saveSeeds} />
                </Card>
              ))}
          </div>
        </section>
      ) : null}
      <FixtureSteps
        championshipId={championship.id}
        status={championship.status}
        scheduled={fixture.matches.filter((match) => match.courtId !== null).length}
        unplaced={unplaced.length}
        finishable={finishable(fixture)}
        actions={{ draw: drawFixture, schedule: scheduleFixture, publish: publishFixture, finish: finishFixture }}
      />
      {shareUrl ? (
        <div className="flex flex-wrap items-start gap-3">
          <ShareButton title={championship.name} text={championshipShareText(championship.name, shareUrl)} />
          <Link
            href={`/c/${championship.publicCode}/tv`}
            target="_blank"
            className={buttonClasses({ variant: 'secondary' })}
          >
            Abrir modo TV
          </Link>
        </div>
      ) : null}
      {live ? (
        <section aria-labelledby="dia" className="flex flex-col gap-3">
          <h2 id="dia" className="font-display text-2xl font-bold uppercase">
            Día del torneo
          </h2>
          <MatchDayBoard
            championshipId={championship.id}
            playing={board.playing}
            upcoming={board.upcoming}
            finished={board.finished}
            rules={rules}
            actions={{ start: startMatch, result: recordResult, walkover: recordWalkover }}
          />
        </section>
      ) : null}
      {showsFixture ? (
        <section aria-labelledby="zonas" className="flex flex-col gap-3">
          <h2 id="zonas" className="font-display text-2xl font-bold uppercase">
            Zonas y llaves
          </h2>
          <ZonesView
            zones={zoneViews(championship, fixture)}
            footer={(zone) =>
              live && zone.needsOrder ? (
                <GroupOrderForm
                  groupId={zone.id}
                  rows={zone.rows.map((row) => ({ entryId: row.entryId, name: row.name }))}
                  tiedNames={zone.tiedNames}
                  action={closeGroup}
                />
              ) : null
            }
          />
          {brackets(championship, views).map((bracket) => (
            <BracketView key={bracket.categoryId} bracket={bracket} />
          ))}
        </section>
      ) : null}
      {showsFixture ? (
        <section aria-labelledby="fixture" className="flex flex-col gap-3">
          <h2 id="fixture" className="font-display text-2xl font-bold uppercase">
            Fixture
          </h2>
          {unplaced.length > 0 ? <UnplacedList items={unplaced} /> : null}
          <FixtureTable
            matches={views}
            basePath={pagePath}
            editable={movable}
            canPin={championship.status === 'drawn'}
            pinAction={pinMatch}
          />
        </section>
      ) : null}
      {moving ? (
        <MoveMatchSheet
          matchId={moving.id}
          title={`${moving.categoryName} · ${moving.name}: ${moving.sideA} vs ${moving.sideB}`}
          options={moveOptions}
          closeHref={pagePath}
          action={moveMatch}
        />
      ) : null}
      {!draft ? (
        <PairsBoard
```

In `app/(club)/club/torneos/campeonatos/[id]/page.tsx`, replace:
```tsx
    </>
  )
}
```
with:
```tsx
      <LiveOccupancy clubId={club.id} />
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
Expected: sin errores; Vitest en verde.

Run (a mano, con el stack local): `npm run dev`, entrar como admin a un campeonato con la inscripción cerrada y al menos dos parejas por categoría (por ejemplo "Torneo Aniversario" de `npm run demo:data`, después de fusionar o cancelar el Mixto), "Sortear", "Programar", abrir "Editar" en una fila, "Publicar fixture".
Expected: aparecen las zonas, las llaves con "1° Zona A", el fixture en tabla, la ventana "Mover partido" con opciones, y después de publicar "Día del torneo", "Compartir" y "Abrir modo TV".

- [ ] **Step 5: Commit**

```bash
git add "app/(club)/club/torneos/campeonatos/[id]/page.tsx"
git commit -m "feat: draw, schedule, publish and run a championship from its page"
```

---

## Corte 6: Público y socio

### Task 25: La página pública `/c/[code]`

**Files:**
- Create: `components/live/auto-refresh.tsx`
- Create: `app/c/[code]/layout.tsx`
- Create: `app/c/[code]/public-board.tsx`
- Create: `app/c/[code]/page.tsx`
- Test: `tests/unit/components/live/auto-refresh.test.tsx`, `tests/unit/app/campeonatos/public-board.test.tsx`

- [ ] **Step 1: Write the failing tests**

`tests/unit/components/live/auto-refresh.test.tsx`:
```tsx
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AutoRefresh } from '@/components/live/auto-refresh'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

describe('AutoRefresh', () => {
  beforeEach(() => {
    refresh.mockClear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reloads the page every few seconds while it is open', () => {
    const { unmount } = render(<AutoRefresh seconds={15} />)
    act(() => vi.advanceTimersByTime(14_999))
    expect(refresh).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(refresh).toHaveBeenCalledTimes(1)
    unmount()
    act(() => vi.advanceTimersByTime(30_000))
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
```

`tests/unit/app/campeonatos/public-board.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PublicBoard, type PublicCategory } from '@/app/c/[code]/public-board'
import { makeView, makeZone } from '../../fixtures/championship-views'

const LIBRE: PublicCategory = {
  id: 'k1',
  name: '6ta Libre',
  rules: 'Al mejor de 3 sets, sin límite de tiempo · Tercer set: súper tie-break a 10',
  zones: [makeZone()],
  bracket: null,
  days: [{ key: '2026-10-17', label: 'Sábado 17 de octubre', matches: [makeView()] }],
}
const DAMAS: PublicCategory = { ...LIBRE, id: 'k2', name: '5ta Damas', zones: [makeZone({ id: 'g2', name: 'Zona B' })] }

describe('PublicBoard', () => {
  it('shows each category in its tab: groups, bracket and matches by day', async () => {
    render(
      <PublicBoard
        name="Campeonato de Primavera"
        subtitle="Del sábado 17 de octubre al domingo 18 de octubre · En juego"
        categories={[LIBRE, DAMAS]}
        shareText="Seguí el Campeonato de Primavera en vivo: https://rustic.uy/c/primavera-7k2f"
        tvHref="/c/primavera-7k2f/tv"
      />,
    )
    expect(screen.getByRole('heading', { name: 'Campeonato de Primavera', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '6ta Libre' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Zona A')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Sábado 17 de octubre')
    await userEvent.click(screen.getByRole('tab', { name: '5ta Damas' }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Zona B')
    expect(screen.getByRole('link', { name: 'Modo TV' })).toHaveAttribute('href', '/c/primavera-7k2f/tv')
    expect(screen.getByRole('button', { name: 'Compartir' })).toBeInTheDocument()
  })

  it('says when the fixture is not out yet', () => {
    render(<PublicBoard name="Copa" subtitle="" categories={[]} shareText="" tvHref="/c/copa-1a2b/tv" />)
    expect(screen.getByText('El fixture todavía no está publicado.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/components/live/auto-refresh.test.tsx tests/unit/app/campeonatos/public-board.test.tsx`
Expected: FAIL — no existen `AutoRefresh` ni `PublicBoard`.

- [ ] **Step 3: Recargar cada 15 segundos**

`components/live/auto-refresh.tsx`:
```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

// The public page and the TV mode have no session for Realtime: they render again every few seconds.
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter()

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000)
    return () => clearInterval(timer)
  }, [router, seconds])

  return null
}
```

- [ ] **Step 4: El layout público** (leer antes `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`: un layout fuera de los grupos `(jugador)` y `(club)` no hereda sus pestañas)

`app/c/[code]/layout.tsx`:
```tsx
import { ClubLogo } from '@/components/brand/club-logo'
import { getClub } from '@/lib/auth/viewer'

// The public pages of a championship (/c/<code> and its TV mode): anyone with the link, no session, no tabs.
// Only the club's logo and name on top.
export default async function PublicChampionshipLayout({ children }: { children: React.ReactNode }) {
  const club = await getClub()
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col md:max-w-3xl lg:max-w-5xl">
      <header className="border-b border-border">
        <div className="flex h-14 items-center gap-3 px-4 md:px-6">
          <ClubLogo club={club} className="size-9" />
          <span className="font-display text-xl font-bold uppercase">{club.name}</span>
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-6 px-4 pb-16 pt-5 md:px-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 5: El tablero público**

`app/c/[code]/public-board.tsx`:
```tsx
'use client'

import Link from 'next/link'
import { useState } from 'react'
import { BracketView } from '@/components/championships/bracket-view'
import { MatchLine } from '@/components/championships/match-line'
import { ZonesView } from '@/components/championships/zones-view'
import { buttonClasses } from '@/components/ui/button'
import { ShareButton } from '@/components/ui/share-button'
import { cn } from '@/lib/cn'
import type { Bracket, DayGroup, ZoneView } from '@/lib/domain/championship-views'

export type PublicCategory = {
  id: string
  name: string
  rules: string
  zones: ZoneView[]
  bracket: Bracket | null
  days: DayGroup[]
}

// Design: "Público /c/<código>": a tab per category with its groups and tables, its bracket and the matches by
// day with their results; "Compartir" and the TV mode.
export function PublicBoard({
  name,
  subtitle,
  categories,
  shareText,
  tvHref,
}: {
  name: string
  subtitle: string
  categories: PublicCategory[]
  shareText: string
  tvHref: string
}) {
  const [selected, setSelected] = useState(categories[0]?.id ?? '')
  const category = categories.find((item) => item.id === selected) ?? categories[0]
  const tabs = categories.length > 1

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold uppercase">{name}</h1>
        {subtitle ? <p className="text-fg-muted">{subtitle}</p> : null}
      </header>
      <div className="flex flex-wrap items-start gap-3">
        <ShareButton title={name} text={shareText} />
        <Link href={tvHref} className={buttonClasses({ variant: 'secondary' })}>
          Modo TV
        </Link>
      </div>
      {categories.length === 0 ? <p className="text-fg-muted">El fixture todavía no está publicado.</p> : null}
      {tabs ? (
        <div role="tablist" aria-label="Categorías" className="flex flex-wrap gap-2">
          {categories.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`tab-${item.id}`}
              aria-selected={item.id === category?.id}
              aria-controls={`panel-${item.id}`}
              onClick={() => setSelected(item.id)}
              className={cn(
                'min-h-11 rounded-full border px-4 font-semibold focus-visible:outline-2 focus-visible:outline-accent',
                item.id === category?.id ? 'border-accent bg-accent text-on-accent' : 'border-border',
              )}
            >
              {item.name}
            </button>
          ))}
        </div>
      ) : null}
      {category ? (
        <div
          role="tabpanel"
          id={`panel-${category.id}`}
          aria-labelledby={tabs ? `tab-${category.id}` : undefined}
          aria-label={tabs ? undefined : category.name}
          className="flex flex-col gap-4"
        >
          <p className="text-sm text-fg-muted">{category.rules}</p>
          <ZonesView zones={category.zones} />
          {category.bracket ? <BracketView bracket={category.bracket} /> : null}
          <section aria-labelledby={`partidos-${category.id}`} className="flex flex-col gap-3">
            <h2 id={`partidos-${category.id}`} className="font-display text-2xl font-bold uppercase">
              Partidos
            </h2>
            {category.days.map((day) => (
              <div key={day.key} className="flex flex-col gap-2">
                <h3 className="font-semibold">{day.label}</h3>
                <ul className="grid gap-2 md:grid-cols-2">
                  {day.matches.map((match) => (
                    <li key={match.id} className="rounded-2xl border border-border bg-surface p-3">
                      <MatchLine match={match} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 6: La página**

`app/c/[code]/page.tsx`:
```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AutoRefresh } from '@/components/live/auto-refresh'
import { getSiteUrl } from '@/lib/auth/redirect'
import { loadPublicChampionship } from '@/lib/data/championship-fixture'
import { isPublicCode } from '@/lib/domain/championship-public'
import { brackets, byDay, championshipShareText, matchViews, zoneViews } from '@/lib/domain/championship-views'
import { CHAMPIONSHIP_STATUS_LABELS, datesText, matchRulesText } from '@/lib/domain/championships'
import { localDateOf } from '@/lib/domain/time'
import { PublicBoard } from './public-board'

export const metadata: Metadata = { title: 'Campeonato en vivo' }

type Params = Promise<{ code: string }>

// Design: the page to share, no session needed; it renders again every 15 seconds.
export default async function PublicChampionshipPage({ params }: { params: Params }) {
  const { code } = await params
  if (!isPublicCode(code)) notFound()
  const data = await loadPublicChampionship(code)
  if (!data) notFound()

  const { championship, fixture } = data
  const ctx = {
    timezone: data.timezone,
    today: localDateOf(new Date(), data.timezone),
    courtName: new Map(data.courts.map((court) => [court.id, court.name])),
  }
  const views = matchViews(championship, fixture, ctx)
  const zones = zoneViews(championship, fixture)
  const allBrackets = brackets(championship, views)
  const categories =
    fixture.matches.length === 0
      ? []
      : championship.categories.map((category) => ({
          id: category.id,
          name: category.name,
          rules: matchRulesText(category),
          zones: zones.filter((zone) => zone.categoryId === category.id),
          bracket: allBrackets.find((bracket) => bracket.categoryId === category.id) ?? null,
          days: byDay(views.filter((view) => view.categoryId === category.id)),
        }))

  return (
    <>
      <PublicBoard
        name={championship.name}
        subtitle={`${datesText(championship)} · ${CHAMPIONSHIP_STATUS_LABELS[championship.status]}`}
        categories={categories}
        shareText={championshipShareText(championship.name, `${getSiteUrl()}/c/${data.code}`)}
        tvHref={`/c/${data.code}/tv`}
      />
      <AutoRefresh seconds={15} />
    </>
  )
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/components/live/auto-refresh.test.tsx tests/unit/app/campeonatos/public-board.test.tsx
npm run typecheck
npm run lint
```
Expected: PASS; typecheck y lint sin errores.

- [ ] **Step 8: Commit**

```bash
git add components/live/auto-refresh.tsx "app/c/[code]/layout.tsx" "app/c/[code]/public-board.tsx" "app/c/[code]/page.tsx" tests/unit/components/live/auto-refresh.test.tsx tests/unit/app/campeonatos/public-board.test.tsx
git commit -m "feat: public championship page to share, refreshed every 15 seconds"
```

---

### Task 26: Modo TV `/c/[code]/tv`

**Files:**
- Create: `app/c/[code]/tv/tv-board.tsx`
- Create: `app/c/[code]/tv/page.tsx`
- Test: `tests/unit/app/campeonatos/tv-board.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/app/campeonatos/tv-board.test.tsx`:
```tsx
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TvBoard } from '@/app/c/[code]/tv/tv-board'
import { makeView } from '../../fixtures/championship-views'

describe('TvBoard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('turns every 20 seconds between what is being played, what comes next and each bracket', () => {
    render(
      <TvBoard
        name="Campeonato de Primavera"
        screens={[
          { key: 'playing', title: 'En juego ahora', matches: [makeView({ status: 'playing', statusLabel: 'En juego' })] },
          { key: 'upcoming', title: 'Próximos', matches: [] },
          {
            key: 'k1',
            title: 'Llave · 6ta Libre',
            bracket: { categoryId: 'k1', categoryName: '6ta Libre', rounds: [{ round: 1, name: 'Final', matches: [makeView({ id: 'f', name: 'Final' })] }] },
          },
        ]}
      />,
    )
    expect(screen.getByRole('heading', { name: 'En juego ahora' })).toBeInTheDocument()
    expect(screen.getByText('Ana y Pedro')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(20_000))
    expect(screen.getByRole('heading', { name: 'Próximos' })).toBeInTheDocument()
    expect(screen.getByText('Nada por ahora.')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(20_000))
    expect(screen.getByRole('region', { name: 'Llave de 6ta Libre' })).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(20_000))
    expect(screen.getByRole('heading', { name: 'En juego ahora' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/app/campeonatos/tv-board.test.tsx`
Expected: FAIL — no existe `TvBoard`.

- [ ] **Step 3: Write minimal implementation**

`app/c/[code]/tv/tv-board.tsx`:
```tsx
'use client'

import { useEffect, useState } from 'react'
import { BracketView } from '@/components/championships/bracket-view'
import { MatchLine } from '@/components/championships/match-line'
import type { Bracket, MatchView } from '@/lib/domain/championship-views'

export type TvScreen = { key: string; title: string; matches: MatchView[] } | { key: string; title: string; bracket: Bracket }

// Design: "Modo TV": the whole screen, big letters, the club's colors; it turns every 20 seconds between "En juego
// ahora", "Próximos" and each bracket.
export function TvBoard({ name, screens, seconds = 20 }: { name: string; screens: TvScreen[]; seconds?: number }) {
  const [turn, setTurn] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setTurn((current) => current + 1), seconds * 1000)
    return () => clearInterval(timer)
  }, [seconds])

  const screen = screens.length > 0 ? screens[turn % screens.length] : null
  return (
    <div className="fixed inset-0 z-50 flex flex-col gap-8 overflow-hidden bg-bg p-8 text-fg lg:p-12">
      <header className="flex flex-wrap items-baseline justify-between gap-6">
        <p className="font-display text-4xl font-bold uppercase lg:text-5xl">{name}</p>
        {screen ? (
          <h1 className="font-display text-4xl font-bold uppercase text-accent-ink lg:text-5xl">{screen.title}</h1>
        ) : null}
      </header>
      {screen === null ? <p className="text-3xl">Todavía no hay partidos.</p> : null}
      {screen && 'bracket' in screen ? <BracketView bracket={screen.bracket} large /> : null}
      {screen && 'matches' in screen ? (
        <ul className="grid gap-6 lg:grid-cols-2">
          {screen.matches.length === 0 ? <li className="text-3xl">Nada por ahora.</li> : null}
          {screen.matches.map((match) => (
            <li key={match.id} className="rounded-3xl border border-border bg-surface p-6">
              <MatchLine match={match} showCategory large />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
```

`app/c/[code]/tv/page.tsx`:
```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AutoRefresh } from '@/components/live/auto-refresh'
import { loadPublicChampionship } from '@/lib/data/championship-fixture'
import { isPublicCode } from '@/lib/domain/championship-public'
import { brackets, dayBoard, matchViews } from '@/lib/domain/championship-views'
import { localDateOf } from '@/lib/domain/time'
import { TvBoard, type TvScreen } from './tv-board'

export const metadata: Metadata = { title: 'Modo TV' }

type Params = Promise<{ code: string }>

// For the club's screen: no session, renders again every 15 seconds (the board keeps its turn).
export default async function ChampionshipTvPage({ params }: { params: Params }) {
  const { code } = await params
  if (!isPublicCode(code)) notFound()
  const data = await loadPublicChampionship(code)
  if (!data) notFound()

  const views = matchViews(data.championship, data.fixture, {
    timezone: data.timezone,
    today: localDateOf(new Date(), data.timezone),
    courtName: new Map(data.courts.map((court) => [court.id, court.name])),
  })
  const board = dayBoard(views, 8)
  const screens: TvScreen[] = [
    { key: 'playing', title: 'En juego ahora', matches: board.playing },
    { key: 'upcoming', title: 'Próximos', matches: board.upcoming },
    ...brackets(data.championship, views).map((bracket) => ({
      key: bracket.categoryId,
      title: `Llave · ${bracket.categoryName}`,
      bracket,
    })),
  ]
  return (
    <>
      <TvBoard name={data.championship.name} screens={screens} />
      <AutoRefresh seconds={15} />
    </>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run tests/unit/app/campeonatos/tv-board.test.tsx
npm run typecheck
```
Expected: PASS; typecheck sin errores.

- [ ] **Step 5: Commit**

```bash
git add "app/c/[code]/tv/tv-board.tsx" "app/c/[code]/tv/page.tsx" tests/unit/app/campeonatos/tv-board.test.tsx
git commit -m "feat: championship TV mode turning between live, next and brackets"
```

---

### Task 27: Mis partidos (en el campeonato y en Inicio) y compartir

**Files:**
- Create: `components/championships/my-matches.tsx`
- Modify: `app/(jugador)/campeonatos/[id]/page.tsx`
- Modify: `app/(jugador)/page.tsx`
- Test: `tests/unit/components/championships/my-matches.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/championships/my-matches.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MyMatches } from '@/components/championships/my-matches'
import { makeView } from '../../fixtures/championship-views'

describe('MyMatches', () => {
  it('lists the viewer\'s matches with time, court, category, rival and state', () => {
    render(
      <MyMatches
        matches={[{ ...makeView(), rival: 'Bruno y Lucía', href: '/campeonatos/ch1', championshipName: 'Copa de Primavera' }]}
      />,
    )
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/campeonatos/ch1')
    expect(link).toHaveTextContent('Hoy 08:00 · Cancha 1')
    expect(link).toHaveTextContent('Copa de Primavera · 6ta Libre · Zona A')
    expect(link).toHaveTextContent('vs Bruno y Lucía · Programado')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/championships/my-matches.test.tsx`
Expected: FAIL — no existe `MyMatches`.

- [ ] **Step 3: Write minimal implementation**

`components/championships/my-matches.tsx`:
```tsx
import Link from 'next/link'
import type { MyMatchItem } from '@/lib/domain/championship-views'

// Design: "Mis partidos": every category of the viewer, with court, time and result.
export function MyMatches({ matches }: { matches: MyMatchItem[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {matches.map((match) => (
        <li key={match.id}>
          <Link
            href={match.href}
            className="flex min-h-12 flex-col gap-0.5 rounded-xl border border-border bg-bg px-3 py-2 hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="font-semibold">
              {match.day && match.time ? `${match.day} ${match.time}` : 'Sin horario todavía'}
              {match.court ? ` · ${match.court}` : ''}
            </span>
            <span className="text-sm">{[match.championshipName, match.categoryName, match.name].filter(Boolean).join(' · ')}</span>
            <span className="text-sm text-fg-muted">
              {[`vs ${match.rival}`, match.score, match.statusLabel].filter(Boolean).join(' · ')}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: Mis partidos y compartir en `/campeonatos/[id]`**

In `app/(jugador)/campeonatos/[id]/page.tsx`, replace:
```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
```
with:
```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MyMatches } from '@/components/championships/my-matches'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { buttonClasses } from '@/components/ui/button'
import { ShareButton } from '@/components/ui/share-button'
import { getSiteUrl } from '@/lib/auth/redirect'
import { loadFixture } from '@/lib/data/championship-fixture'
import { loadActiveCourts } from '@/lib/data/tournaments'
import { EMPTY_FIXTURE, type Fixture } from '@/lib/domain/championship-fixture'
import { championshipShareText, matchViews, myMatchViews } from '@/lib/domain/championship-views'
import { localDateOf } from '@/lib/domain/time'
```

In `app/(jugador)/campeonatos/[id]/page.tsx`, replace:
```tsx
  const blocks = championshipBlocks(championship.windows)

  return (
    <ChampionshipBoard
```
with:
```tsx
  const blocks = championshipBlocks(championship.windows)
  const live = ['published', 'in_progress', 'finished'].includes(championship.status)
  const [fixture, courts]: [Fixture, { id: string; name: string }[]] = live
    ? await Promise.all([loadFixture(championship.id), loadActiveCourts(club)])
    : [EMPTY_FIXTURE, []]
  const views = matchViews(championship, fixture, {
    timezone: club.timezone,
    today: localDateOf(now, club.timezone),
    courtName: new Map(courts.map((court) => [court.id, court.name])),
  })
  const publicPath = championship.publicCode ? `/c/${championship.publicCode}` : null
  const mine = myMatchViews(championship, views, viewer.userId).map((match) => ({
    ...match,
    href: publicPath ?? `/campeonatos/${championship.id}`,
    championshipName: null,
  }))

  const board = (
    <ChampionshipBoard
```

In `app/(jugador)/campeonatos/[id]/page.tsx`, replace:
```tsx
      actions={{ register: registerPair, withdraw: withdrawEntry, hours: saveUnavailability, report: reportChampionshipTransfer }}
    />
  )
}
```
with:
```tsx
      actions={{ register: registerPair, withdraw: withdrawEntry, hours: saveUnavailability, report: reportChampionshipTransfer }}
    />
  )

  return (
    <>
      {board}
      {live ? (
        <section aria-labelledby="mis-partidos" className="flex flex-col gap-3">
          <h2 id="mis-partidos" className="font-display text-2xl font-bold uppercase">
            Mis partidos
          </h2>
          {mine.length > 0 ? (
            <MyMatches matches={mine} />
          ) : (
            <p className="text-fg-muted">No tenés partidos en este campeonato.</p>
          )}
          {publicPath ? (
            <div className="flex flex-wrap items-start gap-3">
              <Link href={publicPath} className={buttonClasses({ variant: 'secondary' })}>
                Ver el fixture completo
              </Link>
              <ShareButton
                title={championship.name}
                text={championshipShareText(championship.name, `${getSiteUrl()}${publicPath}`)}
              />
            </div>
          ) : null}
        </section>
      ) : null}
      <LiveOccupancy clubId={club.id} />
    </>
  )
}
```

- [ ] **Step 5: Mis partidos en Inicio**

In `app/(jugador)/page.tsx`, replace:
```tsx
import { MatchCard } from '@/components/matches/match-card'
```
with:
```tsx
import { MyMatches } from '@/components/championships/my-matches'
import { MatchCard } from '@/components/matches/match-card'
```

In `app/(jugador)/page.tsx`, replace:
```tsx
import { loadTournaments } from '@/lib/data/tournaments'
```
with:
```tsx
import { loadMyChampionshipMatches } from '@/lib/data/championship-fixture'
import { loadTournaments } from '@/lib/data/tournaments'
```

In `app/(jugador)/page.tsx`, replace:
```tsx
  const [grid, bookings, matches, context, tournaments, dayUse, waitlist] = await Promise.all([
```
with:
```tsx
  const [grid, bookings, matches, context, tournaments, dayUse, waitlist, championshipMatches] = await Promise.all([
```

In `app/(jugador)/page.tsx`, replace:
```tsx
    loadMyWaitlist(viewer, now),
  ])
```
with:
```tsx
    loadMyWaitlist(viewer, now),
    loadMyChampionshipMatches(club, viewer.userId, now),
  ])
```

In `app/(jugador)/page.tsx`, replace:
```tsx
          <WaitingCard waits={waitItems(waitlist.waits, waitlist.courts, today)} cancelAction={cancelSlotWait} />
```
with:
```tsx
          <WaitingCard waits={waitItems(waitlist.waits, waitlist.courts, today)} cancelAction={cancelSlotWait} />
          {championshipMatches.length > 0 ? (
            <Card className="flex flex-col gap-2">
              <h2 className="font-display text-2xl font-bold uppercase">Mis partidos</h2>
              <MyMatches matches={championshipMatches} />
            </Card>
          ) : null}
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/components/championships/my-matches.test.tsx
npm test
npm run typecheck
npm run lint
```
Expected: PASS; typecheck y lint sin errores (si algún test de Inicio mockea `@/lib/data/…`, sumarle `loadMyChampionshipMatches: async () => []`).

- [ ] **Step 7: Commit**

```bash
git add components/championships/my-matches.tsx "app/(jugador)/campeonatos/[id]/page.tsx" "app/(jugador)/page.tsx" tests/unit/components/championships/my-matches.test.tsx
git commit -m "feat: my championship matches on Inicio and on the championship page, with share"
```

---

## Corte 7: Demo, e2e y cierre

### Task 28: Un campeonato jugándose hoy en la demo

**Files:**
- Modify: `scripts/demo-data.mjs`

- [ ] **Step 1: El campeonato de hoy** (# no unit test — script de datos de muestra; se verifica corriéndolo)

In `scripts/demo-data.mjs`, replace:
```js
import { randomBytes } from 'node:crypto'
```
with:
```js
import { randomBytes, randomUUID } from 'node:crypto'
```

In `scripts/demo-data.mjs`, replace:
```js
// Things that take whole courts go first: day use, tournaments, recurring slots and the block.
```
with:
```js
// ---------- a championship being played today ----------
// It takes this afternoon's courts before anything else does, so the bookings below leave them free.
const liveChampionship = await championshipToday()

// Things that take whole courts go first: day use, tournaments, recurring slots and the block.
```

In `scripts/demo-data.mjs`, replace:
```js
// Today if it still fits before closing, otherwise tomorrow; started with some results.
const playDay = futureSlot(0, '17:00') ? 0 : 1
```
with:
```js
// Today after the championship if it still fits before closing, otherwise tomorrow; started with some results.
const playDay = futureSlot(0, '20:00') ? 0 : 1
```

In `scripts/demo-data.mjs`, replace:
```js
  p_starts_at: at(playDay, '17:00').toISOString(),
```
with:
```js
  p_starts_at: at(playDay, '20:00').toISOString(),
```

In `scripts/demo-data.mjs`, replace:
```js
  [0, '21:30', 1, 'diego', ['camila', 'valentina']],
```
with:
```js
  [0, '21:30', 2, 'diego', ['camila', 'valentina']],
```

In `scripts/demo-data.mjs`, replace:
```js
const championshipLines = []
```
with:
```js
const championshipLines = liveChampionship
  ? [`Copa de la Casa (jugándose hoy: ${liveChampionship.finished} terminados, ${liveChampionship.playing} en juego, el resto por jugar)`]
  : []
```

In `scripts/demo-data.mjs`, replace:
```js
async function joinAnywhere(client, matchId) {
```
with:
```js
// "Copa de la Casa", being played this afternoon on the first three courts: 5ta Libre in two groups of 3 and a
// final between their winners, 6ta Damas by direct knockout; 60-minute matches from 12:30 to 19:30. Inserted
// directly: the functions never schedule nor record results in the past. The demo's clock stays between 15:00
// and 17:00, so there are always matches played, one being played and the rest to come. In each match the first
// pair named wins 6-3 6-4.
async function championshipToday() {
  if (courts.length < 3) {
    console.warn('  (se saltea el campeonato de hoy: necesita 3 canchas)')
    return null
  }
  const used = courts.slice(0, 3)
  const name = 'Copa de la Casa'
  const startAt = (time) => zoned(today, time)
  const clock = Math.min(Math.max(now.getTime(), startAt('15:00').getTime()), startAt('17:00').getTime())
  const statusAt = (start) =>
    start.getTime() + 3_600_000 <= clock ? 'finished' : start.getTime() <= clock ? 'playing' : 'scheduled'
  const insert = async (table, rows) => {
    const { data, error } = await admin.from(table).insert(rows).select('*')
    if (error) throw new Error(`${table}: ${error.message}`)
    return data
  }

  const created = await admin
    .from('championships')
    .insert({
      club_id: club.id,
      name,
      rules: 'Zonas de 3 parejas y final en 5ta; llave directa en 6ta Damas. Partidos de 60 minutos, al mejor de 3 sets con súper tie-break.',
      status: 'in_progress',
      registration_opens_at: new Date(now.getTime() - 10 * 86_400_000).toISOString(),
      registration_closes_at: new Date(now.getTime() - 86_400_000).toISOString(),
      public_code: `copa-de-la-casa-${randomBytes(2).toString('hex')}`,
      draw_seed: 1,
      created_by: staffId,
    })
    .select('id')
    .single()
  if (created.error) {
    console.warn(`  (se saltea el campeonato de hoy: ${created.error.message})`)
    return null
  }
  const id = created.data.id

  try {
    await insert('championship_windows', [
      { club_id: club.id, championship_id: id, on_date: today, from_time: '12:30', to_time: '19:30', court_ids: used.map((item) => item.id) },
    ])
    const period = `[${startAt('12:30').toISOString()},${startAt('19:30').toISOString()})`
    for (const item of used) {
      await insert('court_occupancy', [
        { club_id: club.id, court_id: item.id, kind: 'championship', period, note: name, championship_id: id, created_by: staffId },
      ])
    }
    const [libre, damas] = await insert('championship_categories', [
      { club_id: club.id, championship_id: id, name: '5ta Libre', gender: 'open', min_pairs: 4, max_pairs: 8, price: 2000, format: 'groups_knockout', group_size: 3, qualifiers_per_group: 1, match_minutes: 60, seeding: 'ranking', sort_order: 0 },
      { club_id: club.id, championship_id: id, name: '6ta Damas', gender: 'women', min_pairs: 4, max_pairs: 4, price: 1800, format: 'knockout', group_size: 4, qualifiers_per_group: 2, match_minutes: 60, seeding: 'ranking', sort_order: 1 },
    ])

    const members = ['martin', 'nicolas', 'santiago', 'federico', 'diego', 'joaquin', 'gonzalo', 'matias', 'agustin', 'bruno', 'valentina', 'camila', 'florencia', 'carolina', 'mariana', 'andrea', 'paula']
    const memberRows = await insert('players', members.map((key) => ({ club_id: club.id, name: people[key].name, profile_id: people[key].id, created_by: staffId })))
    const outsideRows = await insert('players', [['Marcos Lima', '099111301'], ['Ignacio Paz', '099111302'], ['Rocío Vidal', '099111303']].map(([player, phone]) => ({ club_id: club.id, name: player, phone, created_by: staffId })))
    const playerId = Object.fromEntries([...members.map((key, index) => [key, memberRows[index].id]), ...outsideRows.map((row) => [row.name, row.id])])
    const entries = async (categoryId, pairs) =>
      (await insert('championship_entries', pairs.map(([first, second]) => ({
        club_id: club.id,
        category_id: categoryId,
        player1_id: playerId[first],
        player2_id: playerId[second],
        player1_level: people[first]?.category ?? 6,
        player2_level: people[second]?.category ?? 6,
        status: 'active',
        created_by: staffId,
      })))).map((row) => row.id)
    const libreEntries = await entries(libre.id, [['martin', 'nicolas'], ['santiago', 'federico'], ['diego', 'Marcos Lima'], ['joaquin', 'gonzalo'], ['matias', 'agustin'], ['bruno', 'Ignacio Paz']])
    const damasEntries = await entries(damas.id, [['valentina', 'camila'], ['florencia', 'carolina'], ['mariana', 'andrea'], ['paula', 'Rocío Vidal']])

    const [zoneA, zoneB] = await insert('championship_groups', ['Zona A', 'Zona B'].map((zone, index) => ({ club_id: club.id, championship_id: id, category_id: libre.id, name: zone, sort_order: index })))
    const zones = [[zoneA.id, libreEntries.slice(0, 3)], [zoneB.id, libreEntries.slice(3)]]
    await insert('championship_group_members', zones.flatMap(([groupId, ids]) => ids.map((entryId, index) => ({ group_id: groupId, club_id: club.id, entry_id: entryId, draw_position: index + 1 }))))

    // A group of 3 plays as championship-draw.ts draws it: 2nd-3rd, 1st-3rd, 1st-2nd, an hour of rest between.
    const plan = []
    zones.forEach(([groupId, ids], courtIndex) => {
      ;[[1, 2], [0, 2], [0, 1]].forEach(([a, b], index) => {
        plan.push({ key: `${groupId}-${index}`, category: libre.id, group: groupId, a: ids[a], b: ids[b], court: used[courtIndex], start: ['12:30', '14:30', '16:30'][index] })
      })
    })
    plan.push({ key: 'F5', category: libre.id, round: 1, position: 1, sourceA: { group: zoneA.id, place: 1 }, sourceB: { group: zoneB.id, place: 1 }, court: used[0], start: '18:30' })
    plan.push({ key: 'SF1', category: damas.id, round: 2, position: 1, a: damasEntries[0], b: damasEntries[3], court: used[2], start: '12:30' })
    plan.push({ key: 'SF2', category: damas.id, round: 2, position: 2, a: damasEntries[1], b: damasEntries[2], court: used[2], start: '13:30' })
    plan.push({ key: 'F6', category: damas.id, round: 1, position: 1, a: damasEntries[0], b: damasEntries[1], winnerOf: ['SF1', 'SF2'], court: used[2], start: '15:30' })
    const ids = Object.fromEntries(plan.map((match) => [match.key, randomUUID()]))
    const rows = plan.map((match) => {
      const startsAt = startAt(match.start)
      const endsAt = new Date(startsAt.getTime() + 3_600_000)
      const status = match.a && match.b ? statusAt(startsAt) : 'scheduled'
      const done = status === 'finished'
      return {
        id: ids[match.key],
        club_id: club.id,
        championship_id: id,
        category_id: match.category,
        stage: match.group ? 'group' : 'knockout',
        group_id: match.group ?? null,
        round: match.round ?? null,
        bracket_position: match.position ?? null,
        entry_a_id: match.a ?? null,
        entry_b_id: match.b ?? null,
        source_a: match.sourceA ?? (match.winnerOf ? { winner_of: ids[match.winnerOf[0]] } : null),
        source_b: match.sourceB ?? (match.winnerOf ? { winner_of: ids[match.winnerOf[1]] } : null),
        court_id: match.court.id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status,
        winner_entry_id: done ? match.a : null,
        recorded_by: done ? staffId : null,
        recorded_at: done ? endsAt.toISOString() : null,
      }
    })
    await insert('championship_matches', rows)
    const finished = rows.filter((row) => row.status === 'finished')
    if (finished.length > 0) {
      await insert('championship_match_sets', finished.flatMap((row) => [[1, 6, 3], [2, 6, 4]].map(([set, a, b]) => ({ match_id: row.id, club_id: club.id, set_number: set, games_a: a, games_b: b }))))
    }
    return { id, finished: finished.length, playing: rows.filter((row) => row.status === 'playing').length }
  } catch (error) {
    console.warn(`  (se saltea el campeonato de hoy: ${error.message})`)
    await admin.from('championships').delete().eq('id', id)
    return null
  }
}

async function joinAnywhere(client, matchId) {
```

- [ ] **Step 2: Correrlo**

Run:
```bash
npm run db:reset
npm run demo:data
```
Expected: el resumen final incluye `Copa de la Casa (jugándose hoy: N terminados, M en juego, el resto por jugar)` con `N ≥ 2` y `M ≥ 1`, y no hay `(se saltea el campeonato de hoy: …)`.

Run (comprobar los estados en la base):
```bash
node --input-type=module -e "import { createClient } from '@supabase/supabase-js'; import { localSupabase } from './scripts/local-supabase.mjs'; const env = localSupabase(); const admin = createClient(env.apiUrl, env.serviceRoleKey); const { data: ch } = await admin.from('championships').select('id, public_code').eq('name', 'Copa de la Casa').single(); const { data } = await admin.from('championship_matches').select('status').eq('championship_id', ch.id); console.log(ch.public_code, [...new Set(data.map((row) => row.status))].sort().join(' '))"
```
Expected: `copa-de-la-casa-xxxx finished playing scheduled`.

Run (a mano): `npm run dev`, abrir `/c/<código>` sin sesión y `/c/<código>/tv`; con una cuenta de admin del club, `/club/torneos` → "Copa de la Casa" y la grilla de hoy.
Expected: la página pública muestra la Zona A y B con sus tablas, la llave de 6ta Damas con su final, los partidos de hoy con resultados; el modo TV rota cada 20 s; en la grilla del club las tres canchas figuran como "Campeonato" de 12:30 a 19:30 y el americano en juego empieza a las 20:00.

Run (dejar la base limpia para el e2e):
```bash
npm run demo:data -- --clean
```

- [ ] **Step 3: Commit**

```bash
git add scripts/demo-data.mjs
git commit -m "chore(demo): a championship being played this afternoon"
```

---

### Task 29: Flujo e2e: sortear, programar, publicar, cargar la zona y la página pública

**Files:**
- Modify: `tests/e2e/support/championships.ts` (al final)
- Create: `tests/e2e/championship-day.spec.ts`

- [ ] **Step 1: Soporte**

Append to `tests/e2e/support/championships.ts`:
```ts

export type FixtureRow = { id: string; stage: string; entryA: string | null; entryB: string | null }

// The matches of a championship (service role).
export async function fixtureMatches(championshipId: string): Promise<FixtureRow[]> {
  const { data, error } = await adminClient()
    .from('championship_matches')
    .select('id, stage, entry_a_id, entry_b_id')
    .eq('championship_id', championshipId)
  if (error) throw error
  return data.map((row) => ({ id: row.id, stage: row.stage, entryA: row.entry_a_id, entryB: row.entry_b_id }))
}

// Pair id → the number in its first player's name ("P3 Fixture" → 3), service role.
export async function pairNumbers(categoryId: string): Promise<Map<string, number>> {
  const { data, error } = await adminClient()
    .from('championship_entries')
    .select('id, player1:players!championship_entries_player1_in_club(name)')
    .eq('category_id', categoryId)
  if (error) throw error
  return new Map(data.map((row) => [row.id, Number(/^P([0-9]+)/.exec(row.player1?.name ?? '')?.[1] ?? 0)]))
}

// A result recorded by staff through record_match_result: side a or b wins 6-2 6-3.
export async function recordResultAs(user: TestUser, matchId: string, winner: 'a' | 'b'): Promise<void> {
  const client = await signedInClient(user)
  const sets = winner === 'a' ? [[6, 2], [6, 3]] : [[2, 6], [3, 6]]
  const { error } = await client.rpc('record_match_result', { p_match_id: matchId, p_sets: sets })
  if (error) throw error
}

// The public code publish_championship made (service role).
export async function publicCode(championshipId: string): Promise<string> {
  const { data, error } = await adminClient().from('championships').select('public_code').eq('id', championshipId).single()
  if (error) throw error
  if (!data.public_code) throw new Error('El campeonato no tiene código público')
  return data.public_code
}
```

- [ ] **Step 2: Write the e2e test**

`tests/e2e/championship-day.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { addDays, localDateOf } from '../../lib/domain/time'
import { adminClient, clubRow, createMember, signedInClient } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { fixtureMatches, pairNumbers, publicCode, recordResultAs, registerPairAs, uniquePhone } from './support/championships'

// Next's dev indicator covers the bottom-left tab on mobile (fase 3a notes): navigate with page.goto.
test('campeonato: the organizer draws, schedules and publishes, loads the group, and the public page follows it', async ({ page }) => {
  test.setTimeout(240_000)
  const club = await clubRow()
  // Day 22: past the booking window and apart from the registration flow (day 20).
  const day = addDays(localDateOf(new Date(), club.timezone), 22)
  const admin = await createMember({ name: 'Admin Fixture', prefix: 'fix-admin', role: 'admin' })
  const players = await Promise.all([1, 2, 3, 4].map((n) => createMember({ name: `P${n} Fixture`, prefix: `fix-p${n}` })))
  const pair = (n: number) => `P${n} Fixture y Socio ${n}`
  const courts = await adminClient().from('courts').select('id').eq('club_id', club.id).eq('is_active', true).order('sort_order').limit(2)
  if (courts.error) throw courts.error

  // One category of 4 pairs (each player with a partner from outside), registration closed.
  const staff = await signedInClient(admin)
  const created = await staff.rpc('create_championship', { p_club_id: club.id, p_name: 'Fixture E2E' })
  if (created.error) throw created.error
  const championshipId = created.data.id
  const window = await staff.rpc('add_championship_window', {
    p_championship_id: championshipId,
    p_date: day,
    p_from: '08:00',
    p_to: '20:00',
    p_court_ids: courts.data.map((court) => court.id),
  })
  if (window.error) throw window.error
  const category = await staff.rpc('add_championship_category', {
    p_championship_id: championshipId,
    p_name: '6ta Fixture',
    p_gender: 'open',
    p_min_pairs: 2,
    p_max_pairs: 4,
    p_price: 0,
    p_format: 'groups_knockout',
    p_group_size: 4,
    p_qualifiers: 2,
    p_match_minutes: 90,
    p_seeding: 'ranking',
    p_third_set: 'super_tiebreak',
    p_golden_point: false,
  })
  if (category.error) throw category.error
  const opened = await staff.rpc('open_championship_registration', { p_championship_id: championshipId })
  if (opened.error) throw opened.error
  for (const [index, player] of players.entries()) {
    await registerPairAs(player, category.data.id, { name: `Socio ${index + 1}`, phone: uniquePhone() })
  }
  const closed = await staff.rpc('close_championship_registration', { p_championship_id: championshipId })
  if (closed.error) throw closed.error

  // The organizer draws, schedules and publishes.
  await signInWithMagicLink(page, admin.email, `/club/torneos/campeonatos/${championshipId}`)
  await page.getByRole('button', { name: 'Sortear' }).click()
  await expect(page.getByRole('heading', { name: 'Zona A' })).toBeVisible()
  await page.getByRole('button', { name: 'Programar' }).click()
  await expect(page.getByText('Todos los partidos tienen cancha y horario. Revisalos y publicá el fixture.')).toBeVisible()
  await expect(page.getByRole('table', { name: 'Fixture' }).getByRole('row')).toHaveCount(8)
  await page.getByRole('button', { name: 'Publicar fixture' }).click()
  await expect(page.getByRole('heading', { name: 'Día del torneo' })).toBeVisible()

  // Five group results through the API (the lower number wins), the last one on the screen.
  const numbers = await pairNumbers(category.data.id)
  const number = (entryId: string | null) => numbers.get(entryId ?? '') ?? 0
  const [last, ...rest] = (await fixtureMatches(championshipId)).filter((match) => match.stage === 'group')
  for (const match of rest) await recordResultAs(admin, match.id, number(match.entryA) < number(match.entryB) ? 'a' : 'b')
  const [winner, loser] = [number(last.entryA), number(last.entryB)].sort((a, b) => a - b).map(pair)
  await page.reload()
  await page
    .getByRole('region', { name: 'Próximos' })
    .getByRole('listitem')
    .filter({ hasText: winner })
    .filter({ hasText: loser })
    .getByRole('button', { name: 'Cargar resultado' })
    .click()
  const sheet = page.getByRole('dialog', { name: 'Cargar resultado' })
  await sheet.getByLabel(`Set 1 · ${winner}`, { exact: true }).fill('6')
  await sheet.getByLabel(`Set 1 · ${loser}`, { exact: true }).fill('2')
  await sheet.getByLabel(`Set 2 · ${winner}`, { exact: true }).fill('6')
  await sheet.getByLabel(`Set 2 · ${loser}`, { exact: true }).fill('3')
  await sheet.getByRole('button', { name: 'Guardar resultado' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'La zona terminó' })).toBeVisible()

  // The 1st and the 2nd of the group are in the final.
  const bracket = page.getByRole('region', { name: 'Llave de 6ta Fixture' })
  await expect(bracket).toContainText(pair(1))
  await expect(bracket).toContainText(pair(2))

  // The public page, without a session.
  const code = await publicCode(championshipId)
  await page.context().clearCookies()
  await page.goto(`/c/${code}`)
  await expect(page.getByRole('heading', { name: 'Fixture E2E', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Zona A' })).toBeVisible()
  const publicBracket = page.getByRole('region', { name: 'Llave de 6ta Fixture' })
  await expect(publicBracket).toContainText(pair(1))
  await expect(publicBracket).toContainText(pair(2))
  await expect(page.getByText(/6-2 6-3|2-6 3-6/).first()).toBeVisible()
})
```

- [ ] **Step 3: Run it**

Run:
```bash
npm run demo:data -- --clean
npx playwright test tests/e2e/championship-day.spec.ts --workers=1
```
Expected: PASS. Si falla al "Programar" por `courts_busy` en `open_championship_registration`, algo de otro flujo quedó en el día 22: correr `npx playwright test` de nuevo (el `global-setup` limpia lo de las corridas anteriores).

- [ ] **Step 4: Run every e2e flow**

Run: `npx playwright test --workers=1`
Expected: PASS (los doce flujos).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/support/championships.ts tests/e2e/championship-day.spec.ts
git commit -m "test(e2e): draw, schedule, publish, record the group and follow it on the public page"
```

---

### Task 30: Cierre

**Files:**
- Modify: `docs/features/campeonatos-dia-del-torneo/notes.md`, `docs/features/campeonatos-dia-del-torneo/plan.md` (revisiones)

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
Expected: todo PASS (pgTAP completo, Vitest, build y los doce flujos e2e).

- [ ] **Step 2: Revisión de disciplina**

Run `/team-setup:discipline-check` sobre la rama y arreglar lo que encuentre en commits aparte (con su test). Si algún arreglo toca la base, va en una migración nueva `20261007000180_*.sql` con su pgTAP. Mirar en especial: que `public_championship` sea la única función de `anon` y no devuelva teléfonos, notas, pagos ni ids de perfil (`championship_public.test.sql`, `integrity.test.sql`); que ningún helper `private.*` del fixture lo ejecute `authenticated` salvo `fixture_visible`; staff de otro club en cada RPC nueva (`forbidden`); que todas las RPCs que escriben el fixture tomen el candado del campeonato (`private.staff_championship`) antes de leer partidos; que `save_championship_schedule` y `set_match_slot` revaliden con `private.schedule_problem` lo mismo que `checkSchedule` en TS; que el sorteo y el programador sigan siendo puros (sin `Date.now()` ni `Math.random()` dentro de `lib/domain`, la semilla viene de la acción); y que los miembros no vean un sorteo sin publicar (RLS de `championship_matches`).

- [ ] **Step 3: Notas de ejecución**

Append to `docs/features/campeonatos-dia-del-torneo/notes.md` one dated entry per corte with the deviations from this plan (as in `../campeonatos-inscripcion/notes.md`), and to the "Plan revisions" section of this file a `v3` line if the plan changed during execution.

```bash
git add docs/features/campeonatos-dia-del-torneo/notes.md docs/features/campeonatos-dia-del-torneo/plan.md
git commit -m "docs: campeonatos día del torneo execution notes"
git push
```

- [ ] **Step 4: PR listo**

Marcar el PR como listo desde GitHub y esperar CI en verde.
Expected: `quality` y `db-and-e2e` en verde.

- [ ] **Step 5: MANUAL (producción, después del merge)**

- MANUAL (Miguel): confirmar que `migrate.yml` aplicó `20261007000100` a `20261007000170` (`select version from supabase_migrations.schema_migrations order by version desc limit 8`).
- MANUAL: en el entorno de demo (`--prod`), correr `npm run demo:data -- --prod` y abrir la "Copa de la Casa": página pública sin sesión, modo TV en una pantalla, "Mis partidos" con una cuenta de las parejas.
- MANUAL: con un campeonato de prueba con la inscripción cerrada: "Sortear", "Programar", mover un partido, "Publicar fixture" (llega el aviso "Ya está el fixture de …" en la app y por mail), cargar los resultados de una zona y ver a los clasificados en la llave; compartir el link desde el celular.

---

## Acceptance criteria

- [ ] Con la inscripción cerrada, la gestión muestra las parejas de cada categoría por la suma de categorías declaradas y deja numerar cabezas de serie; "Sortear" arma zonas de 3 o 4 (combinadas si no divide justo, 10 = 3+3+4) con un cabeza por zona y el resto en serpentina, y la llave de la potencia de 2 con *byes* a los mejores 1° y sin cruces de la misma zona en la primera ronda; llave directa y todos contra todos también. "Volver a sortear" cambia la semilla hasta publicar.
- [ ] "Programar" ubica todos los partidos de todas las categorías en las canchas y horarios de los días de juego, en pasos de los minutos de cada categoría, sin dos partidos en una cancha, sin jugadores superpuestos (aunque estén en dos categorías), con 45 minutos de descanso por pareja, la llave después de lo que la define y respetando los horarios imposibles; prefiere no hacer esperar más de 3 horas, finales al final del último día y canchas parejas; lista lo no ubicado con su motivo.
- [ ] "Editar" ofrece solo canchas y horarios válidos y fija el partido; "Fijar"/"Soltar" antes de publicar; "Volver a programar" respeta los fijados.
- [ ] "Publicar fixture" exige todo ubicado, crea el link público, avisa a cada jugador socio de cada pareja ("Ya está el fixture de …", en la app y por mail) y, si se pide, devuelve a la grilla las franjas sin partidos.
- [ ] El día del torneo: "En juego ahora", "Próximos" y "Terminados" con "Empezar", "Cargar resultado" (validado según la categoría: 6-5 no, súper tie-break por 2, parcial con límite de tiempo) y "W.O." (6-0 6-0); el ganador de un cruce pasa solo; al terminar una zona sus clasificados entran a la llave (o el organizador desempata con "Cerrar zona"); un resultado se corrige mientras el partido siguiente no empezó; "Finalizar campeonato" al final.
- [ ] `/c/<código>` sin sesión: pestañas por categoría, zonas con tabla, llave, partidos por día con resultados, "Compartir" y "Modo TV"; se recarga cada 15 s. `/c/<código>/tv` rota cada 20 s entre "En juego ahora", "Próximos" y cada llave.
- [ ] El socio ve "Mis partidos" en Inicio y en `/campeonatos/[id]` (todas sus categorías, cancha, horario, resultado), con "Ver el fixture completo" y "Compartir" (`navigator.share` en el celular; en la PC copia el link y lo confirma: "Seguí el {nombre} en vivo: {link}").
- [ ] Dentro de la app la gestión, el campeonato del socio y la grilla se actualizan solos (Realtime sobre partidos y sets).
- [ ] RLS: los miembros ven zonas, partidos y sets solo de campeonatos publicados; el staff, desde el sorteo; el staff de otro club no ve nada y recibe `forbidden`; nadie escribe directo; `anon` solo ejecuta `public_championship`, que no devuelve teléfonos, pagos, notas ni ids de perfil, y nada de borradores ni cancelados.
- [ ] La demo trae la "Copa de la Casa" jugándose hoy de 12:30 a 19:30 con partidos terminados, uno en juego y próximos.
- [ ] pgTAP, Vitest (incluido el caso de 8 categorías × 12 parejas, 3 días y 3 canchas), lint, typecheck, build y los doce flujos e2e en verde en CI.

## Plan revisions

(append-only)

- **v1 (2026-10-06)**: scaffold.
- **v2 (2026-10-06)**: plan completo en 7 cortes (Tasks 1–30) sobre el diseño aprobado. Decisiones propias en "Decisiones que este plan toma" (sin partidos de *bye*, fixture visible a los miembros desde la publicación, fichas para los lugares sin definir, mover también fija, cierre de zona en dos pasos con desempate del organizador, demo con reloj entre 15:00 y 17:00). Migraciones `20261007000100`–`…170`; pgTAP solo con horas de la grilla del fixture. Validado antes de ejecutar: aplicando el plan entero en un worktree aparte, Vitest completo en verde (165 archivos, incluido el caso del spec), typecheck y lint sin errores con los tipos generados de las migraciones nuevas, las 8 migraciones aplicadas y los 7 pgTAP nuevos en verde (122 aserciones) sobre una copia del esquema.
