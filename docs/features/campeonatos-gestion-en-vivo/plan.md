---
feature: campeonatos-gestion-en-vivo
type: plan
status: in-progress
date: 2026-10-07
branch: feat/campeonatos-gestion-en-vivo
references: ./design.md, ../campeonatos-dia-del-torneo/plan.md
---

# Campeonatos: gestión en vivo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/team-setup:execute` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el día del torneo se gestione sin perderse: la página del campeonato en pestañas (Hoy, Fixture, Zonas y llaves, Parejas, Ajustes), un buscador de jugador con la ficha de su pareja (en el club y en la página pública) y un marcador en vivo que recepción carga game a game ("+1", "Deshacer", "Terminar partido") y que se ve en el club, el modo TV y la página pública.

**Architecture:** El marcador vive en Postgres: `championship_live_games` guarda los games en orden y `private.live_sets` los recorre con las reglas de la categoría (las mismas de `private.set_done`) para reescribir `championship_match_sets`, que suma `in_progress`. `score_live_game` y `undo_live_game` son RPCs `security definer` que pasan por `private.staff_match` (candado del campeonato y staff). "Terminar partido" es el `recordResult` de siempre (`record_match_result`), y `private.apply_result` borra los games en vivo. `public_championship` suma `in_progress` a cada set; Realtime ya cubre los sets. Las pestañas son links (`?ver=`) que elige `lib/domain/championship-tabs.ts`; el buscador y la ficha son funciones puras de `lib/domain/championship-search.ts` sobre lo que la página ya cargó; `lib/domain/championship-live.ts` arma lo que manda "Terminar partido".

**Tech Stack:** Next.js 16.3 (App Router, Server Actions), React 19, TypeScript, Tailwind 4, Supabase (Postgres 17, Realtime), Vitest + Testing Library, pgTAP, Playwright.

---

## Antes de empezar

- Rama: `feat/campeonatos-gestion-en-vivo` (sale de `main`, que ya trae la inscripción, el día del torneo y los marcadores de `resultados-ui`; el diseño aprobado está en `81fc74f`). Commits chicos; cada corte termina en verde. Se ejecuta de corrido, sin pedir confirmación entre cortes.
- Docker Desktop corriendo. El CLI de Supabase es devDependency: `npx supabase …` o los scripts de npm (`npm run test:db`, `npm run db:reset`, `npm run db:types`). `gh` no está instalado: el PR se abre y se marca listo desde GitHub.
- Windows: **los archivos con barras invertidas (`\ir` en los tests pgTAP) se escriben con la herramienta Write**, nunca con heredoc ni `sed`. Las rutas con paréntesis o corchetes (`app/(club)/…`, `[id]`, `[code]`) van entre comillas en bash. El TypeScript de este plan no usa barras invertidas.
- Next 16: antes de tocar la página, leer `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` (`searchParams` es una Promise) y `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md` (`Link` y el scroll al cambiar solo la búsqueda).
- Producción: las migraciones llegan con el merge (`migrate.yml`). **Nunca** correr `supabase link`, `db push` ni nada contra producción desde la máquina local. Las migraciones ya aplicadas **no se editan**: `private.apply_result` y `public.public_championship` se copian enteras con `create or replace` en una migración nueva.
- Migraciones nuevas: `supabase/migrations/20261008000100_championship_live_games.sql` y `20261008000110_championship_live_score.sql` (posteriores a `20261007000180_championship_fixture_review_fixes.sql`). No hay valores de enum nuevos: el lado del game es `text` con `check`. Un arreglo de la revisión final va en `20261008000120_*.sql`.
- Docs en español; identificadores, comentarios de SQL y de código en inglés.
- pgTAP: un test se corre con `npx supabase test db supabase/tests/database/<archivo>.test.sql`; todos con `npm run test:db`. El test nuevo incluye, en este orden, `\ir helpers/slot.psql`, `\ir helpers/club.psql`, `\ir helpers/match.psql`, `\ir helpers/day_use.psql` (trae a Eva, staff de otro club) y `\ir helpers/championship.psql` (al que la Task 2 le suma `test_helpers.score`).
- Cada migración nueva se aplica con `npm run db:reset` y después `npm run db:types` regenera `lib/supabase/database.types.ts`, que CI compara byte a byte: se commitea en la misma tarea.
- Datos del fixture pgTAP (club T): personas Ana `…a1`, Bruno `…b1`, Gabi `…a2`, Hugo `…a3`, Iván `…a4`, Juli `…a5` (jugadores), Carla `…c1` (recepción), Dani `…d1` (admin), Eva `…e1` (admin del club B); filas de jugador `c4a00000-0000-0000-0000-0000000000a1` (Ana) … y de afuera `c4a00000-0000-0000-0000-000000000f01` Pedro … `…f06` Raúl. En este documento `…a1` abrevia `00000000-0000-0000-0000-0000000000a1`; **en los archivos va siempre el uuid completo**. Ids: campeonatos `c1a00000-…`, categorías `c2a00000-…`, parejas `c3a00000-…`, partidos `c6a00000-…`.
- **Horas en pgTAP: solo horas de la grilla** (08:00, 09:30, 11:00, 12:30, 14:00, 15:30, 17:00, 18:30, 20:00, 21:30). El test de este plan no usa ninguna: los partidos van sin cancha ni horario.
- Soporte e2e (`tests/e2e/support`): `createMember`, `signedInClient`, `clubRow`, `adminClient`, `signInWithMagicLink`, y de campeonatos `registerPairAs`, `fixtureMatches`, `pairNumbers`, `recordResultAs`, `publicCode` (la Task 11 suma `scoreGamesAs`). **En e2e se navega con `page.goto`** (también entre las pestañas del campeonato).
- jsdom: los `select` se cambian con `userEvent.selectOptions`; `next/link` se renderiza tal cual en Vitest.

## Decisiones que este plan toma (y que el diseño no fijaba)

| Tema | Decisión | Por qué |
| --- | --- | --- |
| Set en curso | Aparece desde el primer game. Cuando un set se cierra y el partido sigue, el siguiente aparece en 0-0 marcado en curso. Con el partido definido no hay set en curso | Se ve qué set se juega; "+1" sobre un partido definido se rechaza (`invalid_state`) |
| Lado del game | `side text check (side in ('a', 'b'))`, sin enum | No hace falta un tipo nuevo ni una migración solo para el enum |
| Quién lee los games | Nadie: RLS sin políticas y sin privilegios para `anon` ni `authenticated`. Las pantallas leen los sets | Los sets ya son la fuente de las pantallas y de Realtime |
| Lo que devuelven las RPCs | `{"sets": [[6,4]], "current": [2,1], "decided": false}`; `current` es `null` sin set en curso | Un solo formato para `+1`, "Deshacer" y los tests |
| Deshacer | Saca el último game aunque el partido ya esté definido; sin games, `invalid_state` | Corregir un +1 de más es lo más común |
| Terminar partido | Usa `recordResult` (la misma acción y RPC de "Cargar resultado": valida, define el ganador, cierra la zona si corresponde, avanza). Sin límite de tiempo aparece cuando alguien ganó 2 sets; con límite, apenas el marcador es un resultado válido (sets cerrados y el set en curso como esté, si tiene games) | Diseño ("con límite de tiempo, se termina con el marcador como esté") |
| Abandono | "Cargar resultado" (abre con los sets en vivo) o "W.O." | Diseño ("se puede terminar a mano antes") |
| Borrar los games | `private.apply_result` (por donde pasan `record_match_result` y `record_walkover`) borra los games en vivo del partido | Diseño ("el resultado final manda") |
| +1 en pantalla | Un botón por pareja con su nombre ("+1 Ana y Pedro"), sin mensaje de éxito; los errores quedan en el lugar | Se toca muchas veces; el marcador es la confirmación |
| Pestañas por estado | Borrador: Ajustes. Inscripción: Parejas, Ajustes. Cerrado: Fixture, Parejas, Ajustes. Sorteado: Fixture, Zonas y llaves, Parejas, Ajustes. Publicado y en juego: las cinco. Finalizado: Fixture, Zonas y llaves, Parejas. Cancelado: Parejas | Diseño ("una pestaña que no corresponde al estado no se ofrece") |
| Dónde va cada cosa | Encabezado: "Abrir inscripción"/"Cerrar inscripción", "Compartir", "Abrir modo TV", "Buscar jugador". Fixture: cabezas de serie (cerrado), "Sortear", "Programar", "Publicar", lo no ubicado y la tabla. Hoy: el tablero y "Finalizar campeonato". Parejas: categorías con pocas parejas y las tablas. Ajustes: días, categorías, datos, afiche y "Cancelar campeonato" al final | Diseño |
| `?partido=` | Abre "Mover partido" siempre en Fixture; al cerrar vuelve a `?ver=fixture` | Los links de la tabla y de lo no ubicado siguen funcionando |
| Zonas y llaves | Una categoría a la vez con `?ver=zonas&categoria=<id>` (links); por defecto la primera con zonas o llave | Diseño ("filtro por categoría arriba") |
| Buscador | Parejas con lugar y en espera de las categorías abiertas; todas las palabras como parte del nombre de la pareja (sin acentos ni mayúsculas); hasta 8 resultados | Diseño |
| Situación de la pareja | "En espera, puesto N", "Con lugar", "En la Zona A", "En la llave · Semifinal 1", "Eliminada", "Campeona"; además "Terminó 2° en la Zona única" (todos contra todos) y "Clasificada a la llave (1° de la Zona A)" mientras espera su cruce | Diseño, más los casos que quedaban sin nombre |
| Ficha del club | Pago con "Cobrar" (si tiene lugar, debe y el club cobra en efectivo), horarios imposibles y teléfonos, sacados de `pairsCategories` | Diseño; la pública se arma sin esas filas |
| PR | Push después de la Task 2 y PR borrador desde GitHub; listo al final | Igual que las fases anteriores |

## Mapa de archivos

| Archivo | Responsabilidad |
| --- | --- |
| `supabase/migrations/20261008000100_championship_live_games.sql` | Tabla `championship_live_games`; `in_progress` en `championship_match_sets` |
| `supabase/migrations/20261008000110_championship_live_score.sql` | `private.live_sets`, `private.write_live_sets`, `score_live_game`, `undo_live_game`; `apply_result` borra los games; `public_championship` con `in_progress` |
| `supabase/tests/database/helpers/championship.psql` | Suma `test_helpers.score` |
| `supabase/tests/database/championship_live.test.sql` | pgTAP del marcador en vivo |
| `lib/domain/championship-fixture.ts`, `lib/data/championship-fixture.ts` | `inProgress` en cada set |
| `lib/domain/championship-live.ts` | Lo que manda "Terminar partido" |
| `lib/domain/championship-tabs.ts` | Pestañas por estado y la de por defecto |
| `lib/domain/championship-search.ts` | Buscar parejas y armar la ficha |
| `components/ui/tab-links.tsx` | Pestañas que son links |
| `components/championships/match-line.tsx` | El set en curso |
| `components/championships/zones-view.tsx` | Fila resaltada |
| `components/championships/match-day-board.tsx` | "+1", "Deshacer", "Terminar partido" |
| `components/championships/player-search.tsx`, `components/championships/pair-card-view.tsx` | Buscador y ficha |
| `components/championships/championship-controls.tsx` | Pasos y "Cancelar campeonato" por separado |
| `app/(club)/club/torneos/campeonatos/fixture-actions.ts` | `scoreGame`, `undoGame` |
| `app/(club)/club/torneos/campeonatos/[id]/page.tsx` | La página en pestañas |
| `app/c/[code]/page.tsx`, `app/c/[code]/public-board.tsx` | Buscador en la página pública |
| `tests/unit/...` | Vitest de cada pieza |
| `tests/e2e/support/championships.ts`, `tests/e2e/championship-day.spec.ts` | Marcador en vivo de punta a punta |

## Secuencia por cortes

| Corte | Tasks | Resultado | Cómo se prueba |
| --- | --- | --- | --- |
| 1. Base | 1–2 | Games en vivo, sets recalculados, terminar, página pública con `in_progress` | pgTAP |
| 2. Dominio TS | 3–5 | Set en curso, "Terminar partido", pestañas, buscador y ficha | Vitest |
| 3. Pantallas | 6–10 | Marcador, pestañas, tablero en vivo, buscador, página del club y pública | Vitest + typecheck |
| 4. e2e y cierre | 11–12 | Flujo completo, PR listo | Playwright |

---

## Corte 1: Base

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
Expected: `feat/campeonatos-gestion-en-vivo`; el último commit es `docs: design championship tabs, player search and live score` (o el de este plan); `db reset` aplica las migraciones hasta `20261007000180_championship_fixture_review_fixes.sql`.

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

### Task 2: El marcador en vivo en la base

**Files:**
- Modify: `supabase/tests/database/helpers/championship.psql` (al final)
- Create: `supabase/tests/database/championship_live.test.sql`
- Create: `supabase/migrations/20261008000100_championship_live_games.sql`
- Create: `supabase/migrations/20261008000110_championship_live_score.sql`
- Modify: `lib/supabase/database.types.ts` (generado)

- [ ] **Step 1: Helper para cargar games** (con la herramienta Edit, al final del archivo)

Append to `supabase/tests/database/helpers/championship.psql`:
```sql

-- Live games for a match, as the caller (not security definer): one public.score_live_game per letter of p_sides
-- ('aab' = a, a, b). Returns what the last one returned.
create function test_helpers.score(p_match_id uuid, p_sides text)
returns jsonb
language plpgsql
as $$
declare
  v_result jsonb;
begin
  for i in 1 .. length(p_sides) loop
    v_result := public.score_live_game(p_match_id, substr(p_sides, i, 1));
  end loop;
  return v_result;
end;
$$;
```

- [ ] **Step 2: Write the failing test** (con la herramienta Write)

`supabase/tests/database/championship_live.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
\ir helpers/championship.psql
select plan(30);

select has_table('public', 'championship_live_games', 'championship_live_games exists');
select has_column('public', 'championship_match_sets', 'in_progress', 'a set says whether it is being played');

-- C1 is published at campeonato-t-ab12. 'Libre' (third set a super tie-break): Ana and Pedro (E1) against Bruno
-- and Lucía (E2) in the semifinal S1, being played; its winner meets Gabi and Marta (E3) in the final F, not
-- started. 'Completo' (a full third set): Hugo and Nico (E4) against Iván and Olga (E5) in M4, being played.
-- 'Corto' (50 minutes of play): Juli and Raúl (E6) against Bruno and Nico (E7) in M5, being played.
call test_helpers.make_championship('c1a00000-0000-0000-0000-000000000001', 'published');
update public.championships set public_code = 'campeonato-t-ab12' where id = 'c1a00000-0000-0000-0000-000000000001';
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000002', 'c1a00000-0000-0000-0000-000000000001',
  'Completo');
call test_helpers.make_category('c2a00000-0000-0000-0000-000000000003', 'c1a00000-0000-0000-0000-000000000001',
  'Corto');
update public.championship_categories set match_rules = match_rules || '{"third_set": "full"}'
 where id = 'c2a00000-0000-0000-0000-000000000002';
update public.championship_categories set match_rules = match_rules || '{"time_limit_minutes": 50}'
 where id = 'c2a00000-0000-0000-0000-000000000003';
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-000000000f01');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f02');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000003', 'c2a00000-0000-0000-0000-000000000001',
  'c4a00000-0000-0000-0000-0000000000a2', 'c4a00000-0000-0000-0000-000000000f03');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a3', 'c4a00000-0000-0000-0000-000000000f04');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000005', 'c2a00000-0000-0000-0000-000000000002',
  'c4a00000-0000-0000-0000-0000000000a4', 'c4a00000-0000-0000-0000-000000000f05');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000006', 'c2a00000-0000-0000-0000-000000000003',
  'c4a00000-0000-0000-0000-0000000000a5', 'c4a00000-0000-0000-0000-000000000f06');
call test_helpers.make_entry('c3a00000-0000-0000-0000-000000000007', 'c2a00000-0000-0000-0000-000000000003',
  'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-000000000f04');
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000001', 'c2a00000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000001', 'c3a00000-0000-0000-0000-000000000002', p_round => 2, p_position => 1);
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000002', 'c2a00000-0000-0000-0000-000000000001',
  null, 'c3a00000-0000-0000-0000-000000000003', p_round => 1, p_position => 1,
  p_source_a => jsonb_build_object('winner_of', 'c6a00000-0000-0000-0000-000000000001'));
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000004', 'c2a00000-0000-0000-0000-000000000002',
  'c3a00000-0000-0000-0000-000000000004', 'c3a00000-0000-0000-0000-000000000005', p_round => 1, p_position => 1);
call test_helpers.make_cmatch('c6a00000-0000-0000-0000-000000000005', 'c2a00000-0000-0000-0000-000000000003',
  'c3a00000-0000-0000-0000-000000000006', 'c3a00000-0000-0000-0000-000000000007', p_round => 1, p_position => 1);
update public.championship_matches set status = 'playing'
 where id in ('c6a00000-0000-0000-0000-000000000001', 'c6a00000-0000-0000-0000-000000000004',
              'c6a00000-0000-0000-0000-000000000005');

set local role authenticated;

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select throws_ok(
  $$ select public.score_live_game('c6a00000-0000-0000-0000-000000000002', 'a') $$,
  'P0001', 'invalid_state', 'a match that is not being played takes no game');
select throws_ok(
  $$ select public.score_live_game('c6a00000-0000-0000-0000-000000000001', 'x') $$,
  'P0001', 'invalid_input', 'a game goes to side a or b');
select throws_ok(
  $$ select public.undo_live_game('c6a00000-0000-0000-0000-000000000001') $$,
  'P0001', 'invalid_state', 'nothing to take back before the first game');

-- S1, set 1: 4-4, then Ana and Pedro win two games: 6-4.
select is(test_helpers.score('c6a00000-0000-0000-0000-000000000001', 'aaaabbbbaa'),
  '{"sets": [[6, 4]], "current": [0, 0], "decided": false}'::jsonb,
  '6-4 closes the first set and the second starts');
select results_eq(
  $$ select set_number::int, games_a::int, games_b::int, super_tiebreak, in_progress
     from public.championship_match_sets where match_id = 'c6a00000-0000-0000-0000-000000000001'
     order by set_number $$,
  $$ values (1, 6, 4, false, false), (2, 0, 0, false, true) $$,
  'the sets are written again, the one being played marked');
-- Set 2: 0-5, 5-5, then Bruno and Lucía win two: 5-7.
select is(test_helpers.score('c6a00000-0000-0000-0000-000000000001', 'bbbbbaaaaabb'),
  '{"sets": [[6, 4], [5, 7]], "current": [0, 0], "decided": false}'::jsonb,
  '7-5 closes a set');
-- Set 3, a super tie-break: 9-9, then 10-9.
select is(test_helpers.score('c6a00000-0000-0000-0000-000000000001', 'aaaaaaaaabbbbbbbbba'),
  '{"sets": [[6, 4], [5, 7]], "current": [10, 9], "decided": false}'::jsonb,
  'the third set is a super tie-break: 10-9 is not over');
select results_eq(
  $$ select games_a::int, games_b::int, super_tiebreak, in_progress from public.championship_match_sets
     where match_id = 'c6a00000-0000-0000-0000-000000000001' and set_number = 3 $$,
  $$ values (10, 9, true, true) $$,
  'the super tie-break is the set being played');
select is(test_helpers.score('c6a00000-0000-0000-0000-000000000001', 'a'),
  '{"sets": [[6, 4], [5, 7], [11, 9]], "current": null, "decided": true}'::jsonb,
  '11-9 wins it by 2: the match is decided');
select throws_ok(
  $$ select public.score_live_game('c6a00000-0000-0000-0000-000000000001', 'b') $$,
  'P0001', 'invalid_state', 'a decided match takes no more games');
select is(public.undo_live_game('c6a00000-0000-0000-0000-000000000001'),
  '{"sets": [[6, 4], [5, 7]], "current": [10, 9], "decided": false}'::jsonb,
  '"Deshacer" takes the last game back');
select lives_ok(
  $$ select public.score_live_game('c6a00000-0000-0000-0000-000000000001', 'a') $$,
  'and the game is loaded again');

-- M4 ('Completo'): 5-5, 6-5, 6-6, and the next game is the tie-break.
select is(test_helpers.score('c6a00000-0000-0000-0000-000000000004', 'aaaaabbbbbab'),
  '{"sets": [], "current": [6, 6], "decided": false}'::jsonb,
  'at 6-6 the set goes on');
select is(test_helpers.score('c6a00000-0000-0000-0000-000000000004', 'a'),
  '{"sets": [[7, 6]], "current": [0, 0], "decided": false}'::jsonb,
  'the next game is the tie-break: 7-6');
select is(test_helpers.score('c6a00000-0000-0000-0000-000000000004', 'bbbbbbaaaaaa'),
  '{"sets": [[7, 6], [0, 6], [6, 0]], "current": null, "decided": true}'::jsonb,
  'a full third set is played to 6');

-- M5 ('Corto', time limit): 3-1 when the time runs out.
select is(test_helpers.score('c6a00000-0000-0000-0000-000000000005', 'aaab'),
  '{"sets": [], "current": [3, 1], "decided": false}'::jsonb,
  'a time-limited match is loaded the same way');
set local role anon;
select results_eq(
  $$ select (s.item ->> 'games_a')::int, (s.item ->> 'games_b')::int, (s.item ->> 'in_progress')::boolean
     from jsonb_array_elements(public.public_championship('campeonato-t-ab12') -> 'matches') as m (item)
     cross join lateral jsonb_array_elements(m.item -> 'sets') as s (item)
     where m.item ->> 'id' = 'c6a00000-0000-0000-0000-000000000005' $$,
  $$ values (3, 1, true) $$,
  'the public page shows the set being played');
set local role authenticated;
select lives_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000005', '[[3,1]]') $$,
  'with a time limit the match ends as it stands');

-- "Terminar partido" on S1, and a W.O. on M4.
select lives_ok(
  $$ select public.record_match_result('c6a00000-0000-0000-0000-000000000001', '[[6,4],[5,7],[11,9]]') $$,
  '"Terminar partido" saves the result');
select lives_ok(
  $$ select public.record_walkover('c6a00000-0000-0000-0000-000000000004', 'c3a00000-0000-0000-0000-000000000005') $$,
  'a W.O. is saved over a live score');

reset role;
select is((select count(*)::int from public.championship_live_games), 0,
  'the final result clears the live games');
select results_eq(
  $$ select set_number::int, games_a::int, games_b::int, super_tiebreak, in_progress
     from public.championship_match_sets where match_id = 'c6a00000-0000-0000-0000-000000000001'
     order by set_number $$,
  $$ values (1, 6, 4, false, false), (2, 5, 7, false, false), (3, 11, 9, true, false) $$,
  'the match keeps its sets, none being played');
select is((select entry_a_id from public.championship_matches where id = 'c6a00000-0000-0000-0000-000000000002'),
  'c3a00000-0000-0000-0000-000000000001'::uuid, 'and its winner goes on to the final');

set local role authenticated;

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok(
  $$ select public.score_live_game('c6a00000-0000-0000-0000-000000000001', 'a') $$,
  'P0001', 'forbidden', 'staff of another club load no games');

-- Ana, a member
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.undo_live_game('c6a00000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'players do not load the score');
select throws_ok(
  $$ select * from public.championship_live_games $$,
  '42501', null, 'nobody reads the live games directly');

reset role;
select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname in ('live_sets', 'write_live_sets')
       and has_function_privilege('authenticated', p.oid, 'execute') $$,
  'authenticated cannot execute the live score helpers');
select ok(
  has_function_privilege('authenticated', 'public.score_live_game(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.score_live_game(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.undo_live_game(uuid)', 'execute'),
  'staff run the live score through authenticated; anon never');

select * from finish();
rollback;
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx supabase test db supabase/tests/database/championship_live.test.sql`
Expected: FAIL (`championship_live_games` does not exist; `function public.score_live_game(uuid, unknown) does not exist`).

- [ ] **Step 4: La tabla de games y el set en curso** (con la herramienta Write)

`supabase/migrations/20261008000100_championship_live_games.sql`:
```sql
-- Campeonatos, gestión en vivo, part 1: the live score. Reception loads the games of a match being played one by
-- one ("+1"); its sets are worked out again from them after every game (next migration) and
-- championship_match_sets marks the one being played. Nobody reads the games directly: the screens show the sets.

create table public.championship_live_games (
  match_id uuid not null,
  club_id uuid not null,
  -- The order the games were loaded in: 1, 2, 3...
  seq integer not null check (seq >= 1),
  side text not null check (side in ('a', 'b')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (match_id, seq),
  constraint championship_live_games_match_in_club
    foreign key (match_id, club_id) references public.championship_matches (id, club_id) on delete cascade
);
alter table public.championship_live_games enable row level security;
revoke all on public.championship_live_games from anon, authenticated;

-- The set being played (at most one per match); the others are closed.
alter table public.championship_match_sets add column in_progress boolean not null default false;
create unique index championship_match_sets_one_in_progress
  on public.championship_match_sets (match_id) where in_progress;
```

- [ ] **Step 5: "+1", "Deshacer", terminar y la página pública** (con la herramienta Write)

`supabase/migrations/20261008000110_championship_live_score.sql`:
```sql
-- Campeonatos, gestión en vivo, part 2: "+1" and "Deshacer". The sets of a match being played are worked out from
-- its live games, in order, under its category's rules (private.set_done): a set closes at 6 with 2 ahead, 7-5 or
-- 7-6 (at 6-6 the next game is the tie-break); a super tie-break third set goes to 10 by 2. Once a pair won 2 sets
-- the match is decided and takes no more games. "Terminar partido" sends the sets to record_match_result; the
-- final result (or a W.O.) clears the live games. The public page gets the set being played.

-- {"sets": [[6,4]], "current": [2,1], "decided": false}: the closed sets and the one being played (null once
-- decided, or before the first game).
create function private.live_sets(p_match_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_super_third boolean;
  v_sets jsonb := '[]'::jsonb;
  v_a integer := 0;
  v_b integer := 0;
  v_won_a integer := 0;
  v_won_b integer := 0;
  v_game record;
begin
  select coalesce(c.match_rules ->> 'third_set', 'super_tiebreak') = 'super_tiebreak' into v_super_third
  from public.championship_matches m
  join public.championship_categories c on c.id = m.category_id
  where m.id = p_match_id;
  for v_game in
    select g.side from public.championship_live_games g where g.match_id = p_match_id order by g.seq
  loop
    if v_won_a = 2 or v_won_b = 2 then
      perform private.fail('invalid_state');
    end if;
    if v_game.side = 'a' then
      v_a := v_a + 1;
    else
      v_b := v_b + 1;
    end if;
    if private.set_done(v_a, v_b, jsonb_array_length(v_sets) = 2 and v_super_third) then
      v_sets := v_sets || jsonb_build_array(jsonb_build_array(v_a, v_b));
      if v_a > v_b then
        v_won_a := v_won_a + 1;
      else
        v_won_b := v_won_b + 1;
      end if;
      v_a := 0;
      v_b := 0;
    end if;
  end loop;
  return jsonb_build_object(
    'sets', v_sets,
    'current', case when v_won_a < 2 and v_won_b < 2 and (v_a + v_b > 0 or jsonb_array_length(v_sets) > 0)
                    then jsonb_build_array(v_a, v_b) end,
    'decided', v_won_a = 2 or v_won_b = 2);
end;
$$;

-- Writes the sets of a match again from its live games (the one being played marked) and returns them.
create function private.write_live_sets(p_match public.championship_matches)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_live jsonb := private.live_sets(p_match.id);
  v_super_third boolean;
  v_closed integer := jsonb_array_length(v_live -> 'sets');
begin
  select coalesce(match_rules ->> 'third_set', 'super_tiebreak') = 'super_tiebreak' into v_super_third
  from public.championship_categories where id = p_match.category_id;
  delete from public.championship_match_sets where match_id = p_match.id;
  insert into public.championship_match_sets (match_id, club_id, set_number, games_a, games_b, super_tiebreak,
                                              in_progress)
  select p_match.id, p_match.club_id, s.n, (s.item ->> 0)::smallint, (s.item ->> 1)::smallint,
         s.n = 3 and v_super_third, s.n > v_closed
  from jsonb_array_elements(
         (v_live -> 'sets')
         || case when jsonb_typeof(v_live -> 'current') = 'array' then jsonb_build_array(v_live -> 'current')
                 else '[]'::jsonb end
       ) with ordinality as s (item, n);
  return v_live;
end;
$$;

-- "+1": a game for side 'a' or 'b' of a match being played.
create function public.score_live_game(p_match_id uuid, p_side text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.championship_matches := private.staff_match(p_match_id);
begin
  if p_side is null or p_side not in ('a', 'b') then
    perform private.fail('invalid_input');
  end if;
  if v_match.status <> 'playing' or (private.live_sets(v_match.id) ->> 'decided')::boolean then
    perform private.fail('invalid_state');
  end if;
  insert into public.championship_live_games (match_id, club_id, seq, side, created_by)
  values (v_match.id, v_match.club_id,
          coalesce((select max(seq) from public.championship_live_games where match_id = v_match.id), 0) + 1,
          p_side, (select auth.uid()));
  return private.write_live_sets(v_match);
end;
$$;

-- "Deshacer": the last game loaded goes away.
create function public.undo_live_game(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.championship_matches := private.staff_match(p_match_id);
begin
  if v_match.status <> 'playing' then
    perform private.fail('invalid_state');
  end if;
  delete from public.championship_live_games
   where match_id = v_match.id
     and seq = (select max(seq) from public.championship_live_games where match_id = v_match.id);
  if not found then
    perform private.fail('invalid_state');
  end if;
  return private.write_live_sets(v_match);
end;
$$;

-- As in 20261007000180, and the final result (or a W.O.) clears the live games: the result has the last word.
create or replace function private.apply_result(
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

  delete from public.championship_live_games where match_id = p_match.id;
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
    update public.championship_matches set entry_a_id = p_winner
     where championship_id = v_match.championship_id and source_a ->> 'winner_of' = v_match.id::text;
    update public.championship_matches set entry_b_id = p_winner
     where championship_id = v_match.championship_id and source_b ->> 'winner_of' = v_match.id::text;
  elsif p_match.status in ('finished', 'walkover') then
    update public.championship_group_members set place = null where group_id = v_match.group_id;
    update public.championship_matches set entry_a_id = null where source_a ->> 'group' = v_match.group_id::text;
    update public.championship_matches set entry_b_id = null where source_b ->> 'group' = v_match.group_id::text;
  end if;
  perform private.mark_in_progress(v_match.championship_id);
  return v_match;
end;
$$;

-- As in 20261007000170, with in_progress on every set (create or replace keeps its grants: anon still runs it).
create or replace function public.public_championship(p_code text)
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
                                                     'games_b', s.games_b, 'super_tiebreak', s.super_tiebreak,
                                                     'in_progress', s.in_progress)
                                  order by s.set_number)
                 from public.championship_match_sets s where s.match_id = m.id), '[]'::jsonb))
             order by m.starts_at nulls last, m.id)
      from public.championship_matches m where m.championship_id = ch.id), '[]'::jsonb) else '[]'::jsonb end
  )
  from public.championships ch
  join public.clubs cl on cl.id = ch.club_id
  where ch.public_code = p_code and ch.status not in ('draft', 'cancelled');
$$;

revoke all on function private.live_sets(uuid) from public;
revoke all on function private.write_live_sets(public.championship_matches) from public;
revoke execute on function public.score_live_game(uuid, text) from public, anon;
revoke execute on function public.undo_live_game(uuid) from public, anon;
grant execute on function public.score_live_game(uuid, text) to authenticated;
grant execute on function public.undo_live_game(uuid) to authenticated;
```

- [ ] **Step 6: Run the tests to verify they pass**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/championship_live.test.sql
npm run test:db
```
Expected: `championship_live.test.sql` 30/30 PASS; todo `test:db` en verde (en especial `integrity.test.sql`: `anon` sigue ejecutando solo `public_championship`, y `championship_results.test.sql` / `championship_public.test.sql` sin cambios).

- [ ] **Step 7: Tipos generados**

Run:
```bash
npm run db:types
npm run typecheck
```
Expected: `lib/supabase/database.types.ts` trae `championship_live_games`, `in_progress` en `championship_match_sets`, `score_live_game` y `undo_live_game`; typecheck PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261008000100_championship_live_games.sql supabase/migrations/20261008000110_championship_live_score.sql supabase/tests/database/helpers/championship.psql supabase/tests/database/championship_live.test.sql lib/supabase/database.types.ts
git commit -m "feat(db): live score by games, with the set being played and the public page"
git push -u origin feat/campeonatos-gestion-en-vivo
```
MANUAL: abrir el PR borrador desde GitHub (`feat/campeonatos-gestion-en-vivo` → `main`).

---

## Corte 2: Dominio TS

### Task 3: El set en curso y "Terminar partido" (`lib/domain/championship-live.ts`)

**Files:**
- Modify: `lib/domain/championship-fixture.ts`, `lib/data/championship-fixture.ts`
- Modify: `tests/unit/fixtures/championship-fixture.ts`, `tests/unit/lib/domain/championship-fixture.test.ts`, `tests/unit/components/championships/match-line.test.tsx`, `tests/unit/components/championships/match-day-board.test.tsx`
- Create: `lib/domain/championship-live.ts`
- Test: `tests/unit/lib/domain/championship-live.test.ts`

- [ ] **Step 1: El helper `set` sabe del set en curso**

In `tests/unit/fixtures/championship-fixture.ts`, replace:
```ts
export function set(a: number, b: number, superTiebreak = false): MatchSet {
  return { a, b, superTiebreak }
}
```
with:
```ts
export function set(a: number, b: number, superTiebreak = false, inProgress = false): MatchSet {
  return { a, b, superTiebreak, inProgress }
}
```

In `tests/unit/components/championships/match-line.test.tsx`, replace:
```tsx
  sets: [
    { a: 6, b: 3, superTiebreak: false },
    { a: 6, b: 4, superTiebreak: false },
  ],
```
with:
```tsx
  sets: [
    { a: 6, b: 3, superTiebreak: false, inProgress: false },
    { a: 6, b: 4, superTiebreak: false, inProgress: false },
  ],
```

In `tests/unit/components/championships/match-day-board.test.tsx`, replace:
```tsx
            sets: [
              { a: 6, b: 3, superTiebreak: false },
              { a: 6, b: 4, superTiebreak: false },
            ],
```
with:
```tsx
            sets: [
              { a: 6, b: 3, superTiebreak: false, inProgress: false },
              { a: 6, b: 4, superTiebreak: false, inProgress: false },
            ],
```

- [ ] **Step 2: Write the failing tests**

Append to `tests/unit/lib/domain/championship-fixture.test.ts`:
```ts

describe('the set being played', () => {
  it('reads in_progress; a set without it is closed', () => {
    const [match] = toFixture(
      [],
      [
        {
          ...FINAL,
          status: 'playing',
          sets: [
            { set_number: 1, games_a: 6, games_b: 4, super_tiebreak: false },
            { set_number: 2, games_a: 2, games_b: 1, super_tiebreak: false, in_progress: true },
          ],
        },
      ],
    ).matches
    expect(match.sets).toEqual([set(6, 4), set(2, 1, false, true)])
    expect(scoreText(match)).toBe('6-4 2-1')
  })
})
```

`tests/unit/lib/domain/championship-live.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { liveFinish } from '@/lib/domain/championship-live'
import type { MatchRules } from '@/lib/domain/championship-results'
import { set } from '../../fixtures/championship-fixture'

const OPEN: MatchRules = { thirdSet: 'super_tiebreak', timeLimit: null }
const TIMED: MatchRules = { thirdSet: 'super_tiebreak', timeLimit: 50 }

describe('liveFinish', () => {
  it('ends a decided match with its sets', () => {
    expect(liveFinish([set(6, 4), set(6, 3)], OPEN)).toEqual({
      sets: [
        [6, 4],
        [6, 3],
      ],
      label: 'Terminar partido con 6-4 6-3',
    })
    expect(liveFinish([set(6, 4), set(4, 6), set(10, 8, true)], OPEN)?.label).toBe('Terminar partido con 6-4 4-6 10-8')
  })

  it('waits while nobody won 2 sets', () => {
    expect(liveFinish([], OPEN)).toBeNull()
    expect(liveFinish([set(6, 4), set(3, 2, false, true)], OPEN)).toBeNull()
  })

  it('with a time limit ends the match as it stands, once that is a result', () => {
    expect(liveFinish([set(6, 4), set(3, 2, false, true)], TIMED)).toEqual({
      sets: [
        [6, 4],
        [3, 2],
      ],
      label: 'Terminar partido con 6-4 3-2',
    })
    expect(liveFinish([set(6, 4), set(0, 0, false, true)], TIMED)?.label).toBe('Terminar partido con 6-4')
    expect(liveFinish([set(6, 4), set(4, 6), set(0, 0, true, true)], TIMED)).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/domain/championship-live.test.ts tests/unit/lib/domain/championship-fixture.test.ts`
Expected: FAIL (`Cannot find module '@/lib/domain/championship-live'`; the sets come back without `inProgress`).

- [ ] **Step 4: El set en curso en el fixture**

In `lib/domain/championship-fixture.ts`, replace:
```ts
export type MatchSet = { a: number; b: number; superTiebreak: boolean }
```
with:
```ts
// inProgress: the set being played (the live score); the others are closed.
export type MatchSet = { a: number; b: number; superTiebreak: boolean; inProgress: boolean }
```

In `lib/domain/championship-fixture.ts`, replace:
```ts
export type SetRow = { set_number: number; games_a: number; games_b: number; super_tiebreak: boolean }
```
with:
```ts
export type SetRow = {
  set_number: number
  games_a: number
  games_b: number
  super_tiebreak: boolean
  // Missing reads as false (a closed set).
  in_progress?: boolean
}
```

In `lib/domain/championship-fixture.ts`, replace:
```ts
      .map((item) => ({ a: item.games_a, b: item.games_b, superTiebreak: item.super_tiebreak })),
```
with:
```ts
      .map((item) => ({
        a: item.games_a,
        b: item.games_b,
        superTiebreak: item.super_tiebreak,
        inProgress: item.in_progress === true,
      })),
```

In `lib/data/championship-fixture.ts`, replace:
```ts
sets:championship_match_sets!championship_match_sets_match_in_club(set_number, games_a, games_b, super_tiebreak)'
```
with:
```ts
sets:championship_match_sets!championship_match_sets_match_in_club(set_number, games_a, games_b, super_tiebreak, in_progress)'
```

- [ ] **Step 5: Lo que manda "Terminar partido"**

`lib/domain/championship-live.ts`:
```ts
import type { MatchSet } from './championship-fixture'
import { checkResult, type MatchRules, type Score } from './championship-results'

// Design: "Marcador en vivo": reception adds the games with "+1" and the database closes the sets
// (private.live_sets). This is what "Terminar partido" sends: the closed sets and, with a time limit, the one being
// played as it stands (if it has games); only once that is a result under the category's rules.

export type LiveFinish = { sets: Score[]; label: string }

export function liveFinish(sets: MatchSet[], rules: MatchRules): LiveFinish | null {
  const scores: Score[] = sets.filter((item) => !item.inProgress).map((item) => [item.a, item.b])
  const current = sets.find((item) => item.inProgress)
  if (rules.timeLimit !== null && current && current.a + current.b > 0) scores.push([current.a, current.b])
  if (scores.length === 0 || !checkResult(scores, rules).ok) return null
  return { sets: scores, label: `Terminar partido con ${scores.map(([a, b]) => `${a}-${b}`).join(' ')}` }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/lib/domain/championship-live.test.ts tests/unit/lib/domain/championship-fixture.test.ts
npm test
npm run typecheck
```
Expected: PASS (todo Vitest en verde: los fixtures que arman sets usan `set()`; los dos literales ya tienen `inProgress`).

- [ ] **Step 7: Commit**

```bash
git add lib/domain/championship-fixture.ts lib/data/championship-fixture.ts lib/domain/championship-live.ts tests/unit/fixtures/championship-fixture.ts tests/unit/lib/domain/championship-fixture.test.ts tests/unit/lib/domain/championship-live.test.ts tests/unit/components/championships/match-line.test.tsx tests/unit/components/championships/match-day-board.test.tsx
git commit -m "feat: the set being played in the fixture, and what ends a live match"
```

---

### Task 4: Las pestañas del campeonato (`lib/domain/championship-tabs.ts`)

**Files:**
- Create: `lib/domain/championship-tabs.ts`
- Test: `tests/unit/lib/domain/championship-tabs.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/domain/championship-tabs.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { championshipTabs, defaultTab, pickTab, TAB_LABELS } from '@/lib/domain/championship-tabs'
import { CHAMPIONSHIP_STATUSES } from '@/lib/domain/championships'

describe('championship tabs', () => {
  it('offers only the tabs that fit the state, in order', () => {
    expect(championshipTabs('draft')).toEqual(['ajustes'])
    expect(championshipTabs('registration')).toEqual(['parejas', 'ajustes'])
    expect(championshipTabs('closed')).toEqual(['fixture', 'parejas', 'ajustes'])
    expect(championshipTabs('drawn')).toEqual(['fixture', 'zonas', 'parejas', 'ajustes'])
    expect(championshipTabs('in_progress')).toEqual(['hoy', 'fixture', 'zonas', 'parejas', 'ajustes'])
    expect(championshipTabs('finished')).toEqual(['fixture', 'zonas', 'parejas'])
    expect(championshipTabs('in_progress').map((tab) => TAB_LABELS[tab])).toEqual([
      'Hoy',
      'Fixture',
      'Zonas y llaves',
      'Parejas',
      'Ajustes',
    ])
  })

  it('opens the tab the state calls for, always one it offers', () => {
    expect(CHAMPIONSHIP_STATUSES.map((status) => defaultTab(status))).toEqual([
      'ajustes',
      'parejas',
      'fixture',
      'fixture',
      'hoy',
      'hoy',
      'zonas',
      'parejas',
    ])
    expect(CHAMPIONSHIP_STATUSES.every((status) => championshipTabs(status).includes(defaultTab(status)))).toBe(true)
  })

  it('keeps the tab asked for only when it fits', () => {
    expect(pickTab('published', 'zonas')).toBe('zonas')
    expect(pickTab('registration', 'hoy')).toBe('parejas')
    expect(pickTab('published', undefined)).toBe('hoy')
    expect(pickTab('drawn', 'nada')).toBe('fixture')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/championship-tabs.test.ts`
Expected: FAIL (`Cannot find module '@/lib/domain/championship-tabs'`).

- [ ] **Step 3: Write minimal implementation**

`lib/domain/championship-tabs.ts`:
```ts
import type { ChampionshipStatus } from './championships'

// Design: "Pestañas del club": the page of a championship in tabs, each a link (?ver=…). A tab that does not fit
// the state is not offered; without one (or with one that does not fit) the page opens the one its state calls for.

export const CHAMPIONSHIP_TABS = ['hoy', 'fixture', 'zonas', 'parejas', 'ajustes'] as const
export type ChampionshipTab = (typeof CHAMPIONSHIP_TABS)[number]

export const TAB_LABELS: Record<ChampionshipTab, string> = {
  hoy: 'Hoy',
  fixture: 'Fixture',
  zonas: 'Zonas y llaves',
  parejas: 'Parejas',
  ajustes: 'Ajustes',
}

const TABS: Record<ChampionshipStatus, ChampionshipTab[]> = {
  draft: ['ajustes'],
  registration: ['parejas', 'ajustes'],
  closed: ['fixture', 'parejas', 'ajustes'],
  drawn: ['fixture', 'zonas', 'parejas', 'ajustes'],
  published: ['hoy', 'fixture', 'zonas', 'parejas', 'ajustes'],
  in_progress: ['hoy', 'fixture', 'zonas', 'parejas', 'ajustes'],
  finished: ['fixture', 'zonas', 'parejas'],
  cancelled: ['parejas'],
}

const DEFAULT_TAB: Record<ChampionshipStatus, ChampionshipTab> = {
  draft: 'ajustes',
  registration: 'parejas',
  closed: 'fixture',
  drawn: 'fixture',
  published: 'hoy',
  in_progress: 'hoy',
  finished: 'zonas',
  cancelled: 'parejas',
}

export function championshipTabs(status: ChampionshipStatus): ChampionshipTab[] {
  return TABS[status]
}

export function defaultTab(status: ChampionshipStatus): ChampionshipTab {
  return DEFAULT_TAB[status]
}

// ?ver=<tab>: the one asked for when the state offers it, otherwise the default.
export function pickTab(status: ChampionshipStatus, requested: string | undefined): ChampionshipTab {
  return TABS[status].find((tab) => tab === requested) ?? DEFAULT_TAB[status]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/domain/championship-tabs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/championship-tabs.ts tests/unit/lib/domain/championship-tabs.test.ts
git commit -m "feat: championship tabs by state, with the default one"
```

---

### Task 5: El buscador y la ficha (`lib/domain/championship-search.ts`)

**Files:**
- Create: `lib/domain/championship-search.ts`
- Test: `tests/unit/lib/domain/championship-search.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/domain/championship-search.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { Fixture } from '@/lib/domain/championship-fixture'
import { pairsCategories } from '@/lib/domain/championship-pairs'
import { pairCards, searchPairs } from '@/lib/domain/championship-search'
import { matchViews, zoneViews, type ViewContext } from '@/lib/domain/championship-views'
import { BRUNO, LUCIA, makeCategory, makeChampionship, makeEntry, player, TIMEZONE } from '../../fixtures/championships'
import { makeGroup, makeMatch, played, set } from '../../fixtures/championship-fixture'

const ANA = player('pl-ana', 'Ana Pérez', 'u-ana')
const PEDRO = player('pl-pedro', 'Pedro Viera')
// 6ta Libre: Ana Pérez and Pedro Viera, Bruno and Lucía, Gabi and Marta waiting. 5ta Mixto: Ana Pérez and Bruno.
const CHAMPIONSHIP = makeChampionship({
  status: 'in_progress',
  categories: [
    makeCategory({
      entries: [
        makeEntry({ id: 'e1', player1: ANA, player2: PEDRO }),
        makeEntry({ id: 'e2', player1: BRUNO, player2: LUCIA }),
        makeEntry({ id: 'e3', player1: player('pl-gabi', 'Gabi'), player2: player('pl-marta', 'Marta'), status: 'waiting' }),
      ],
    }),
    makeCategory({ id: 'k2', name: '5ta Mixto', entries: [makeEntry({ id: 'e4', categoryId: 'k2', player1: ANA, player2: BRUNO })] }),
  ],
})
const CTX: ViewContext = { timezone: TIMEZONE, today: '2026-10-17', courtName: new Map([['court-1', 'Cancha 1']]) }

// Zona A is closed (Ana and Pedro 1st); the semifinal SF1, Ana and Pedro against Bruno and Lucía, is at 14:00 on
// Cancha 1; SF2 is still to be defined; their winners meet in the final.
const ZONE = makeGroup({
  members: [
    { entryId: 'e1', drawPosition: 1, place: 1 },
    { entryId: 'e2', drawPosition: 2, place: 2 },
  ],
})
const SEMI = makeMatch({
  id: 's1',
  stage: 'knockout',
  groupId: null,
  round: 2,
  position: 1,
  courtId: 'court-1',
  startsAt: new Date('2026-10-17T17:00:00Z'),
  endsAt: new Date('2026-10-17T18:30:00Z'),
})
const SEMI2 = makeMatch({ id: 's2', stage: 'knockout', groupId: null, round: 2, position: 2, entryA: null, entryB: null })
const FINAL = makeMatch({
  id: 'f',
  stage: 'knockout',
  groupId: null,
  round: 1,
  position: 1,
  entryA: null,
  entryB: null,
  sourceA: { kind: 'winner', matchId: 's1' },
  sourceB: { kind: 'winner', matchId: 's2' },
})
const FIXTURE: Fixture = { groups: [ZONE], matches: [played('m1', 'e1', 'e2', 'a'), SEMI, SEMI2, FINAL] }

function cards(fixture: Fixture, phones?: Map<string, string>) {
  const views = matchViews(CHAMPIONSHIP, fixture, CTX)
  const input = { championship: CHAMPIONSHIP, fixture, views, zones: zoneViews(CHAMPIONSHIP, fixture) }
  return phones
    ? pairCards(input, pairsCategories(CHAMPIONSHIP, phones).flatMap((category) => category.rows))
    : pairCards(input)
}

function card(fixture: Fixture, entryId: string) {
  return cards(fixture).find((item) => item.entryId === entryId)
}

describe('searchPairs', () => {
  it('finds the pairs with every word typed, without accents, in each of their categories', () => {
    const all = cards(FIXTURE)
    expect(searchPairs(all, 'perez').map((item) => item.label)).toEqual([
      'Ana Pérez y Pedro Viera · 6ta Libre',
      'Ana Pérez y Bruno · 5ta Mixto',
    ])
    expect(searchPairs(all, 'ANA  vie').map((item) => item.entryId)).toEqual(['e1'])
    expect(searchPairs(all, 'pérez bruno').map((item) => item.entryId)).toEqual(['e4'])
    expect(searchPairs(all, '   ')).toEqual([])
  })
})

describe('pairCards', () => {
  it('says where a pair stands: its matches, its group and its next rival in the bracket', () => {
    const ana = card(FIXTURE, 'e1')
    expect(ana).toMatchObject({
      categoryName: '6ta Libre',
      pair: 'Ana Pérez y Pedro Viera',
      situation: 'En la llave · Semifinal 1',
      bracket: { match: 'Semifinal 1', rival: 'Bruno y Lucía', next: 'Si gana: Final contra Ganador SF2' },
      private: null,
    })
    expect(ana?.played.map((match) => match.id)).toEqual(['m1'])
    expect(ana?.upcoming.map((match) => `${match.id} ${match.time} ${match.court}`)).toEqual(['s1 14:00 Cancha 1'])
    expect(ana?.live).toEqual([])
    expect(ana?.zone?.name).toBe('Zona A')
  })

  it('follows a pair to the end: waiting, still in, out or champion', () => {
    const semiPlayed = { ...SEMI, status: 'finished' as const, winner: 'e1', sets: [set(6, 3), set(6, 3)] }
    const lost: Fixture = { ...FIXTURE, matches: [played('m1', 'e1', 'e2', 'a'), semiPlayed, SEMI2, FINAL] }
    expect(card(lost, 'e2')?.situation).toBe('Eliminada')
    const won: Fixture = {
      ...FIXTURE,
      matches: [
        played('m1', 'e1', 'e2', 'a'),
        semiPlayed,
        SEMI2,
        { ...FINAL, entryA: 'e1', entryB: 'e9', status: 'finished', winner: 'e1', sets: [set(6, 2), set(6, 2)] },
      ],
    }
    expect(card(won, 'e1')?.situation).toBe('Campeona')
    expect(card(FIXTURE, 'e3')?.situation).toBe('En espera, puesto 1')
    expect(card({ groups: [], matches: [] }, 'e4')?.situation).toBe('Con lugar')
    const open: Fixture = { groups: [makeGroup({ members: [{ entryId: 'e1', drawPosition: 1, place: null }] })], matches: [] }
    expect(card(open, 'e1')?.situation).toBe('En la Zona A')
  })

  it('adds the payment, the hours and the phones for the club only', () => {
    const club = cards(FIXTURE, new Map([['pl-pedro', '099111001']])).find((item) => item.entryId === 'e1')
    expect(club?.private).toEqual({
      phones: '099111001',
      paymentState: 'pending',
      charge: 2000,
      hoursText: 'Pueden jugar en cualquier horario.',
    })
    expect(cards(FIXTURE).every((item) => item.private === null)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/domain/championship-search.test.ts`
Expected: FAIL (`Cannot find module '@/lib/domain/championship-search'`).

- [ ] **Step 3: Write minimal implementation**

`lib/domain/championship-search.ts`:
```ts
import { isDone, knockoutLabel, type Fixture, type FixtureMatch } from './championship-fixture'
import type { PairRow } from './championship-pairs'
import type { MatchView, ZoneView } from './championship-views'
import {
  ENTRY_STATUS_LABELS,
  entryStateText,
  openCategories,
  pairName,
  type Championship,
  type ChampionshipCategory,
  type ChampionshipEntry,
} from './championships'
import { normalizeText } from './members'
import type { PaymentState } from './payments'

// Design: "Buscador de jugador": the pairs whose names have every word typed (no accents, any case), each with its
// category; and the card of a pair: where it stands, its matches, its group and its way through the bracket. Made
// from what the page already loaded. The club's card also has the payment, the hours and the phones; the public
// one never does (it is built without the club's rows).

export type CardPrivate = { phones: string; paymentState: PaymentState; charge: number | null; hoursText: string }
export type CardBracket = { match: string; rival: string; next: string | null }
export type PairCard = {
  entryId: string
  categoryId: string
  categoryName: string
  pair: string
  // "Ana Pérez y Pedro Viera · 6ta Libre".
  label: string
  // "Con lugar", "En espera, puesto 2", "En la Zona A", "En la llave · Semifinal 1", "Eliminada", "Campeona".
  situation: string
  live: MatchView[]
  upcoming: MatchView[]
  played: MatchView[]
  zone: ZoneView | null
  bracket: CardBracket | null
  private: CardPrivate | null
}
export type CardInput = {
  championship: Pick<Championship, 'categories'>
  fixture: Fixture
  views: MatchView[]
  zones: ZoneView[]
}

const RESULTS = 8

export function searchPairs<T extends Pick<PairCard, 'pair'>>(pairs: T[], query: string, limit = RESULTS): T[] {
  const words = normalizeText(query)
    .split(' ')
    .filter((word) => word !== '')
  if (words.length === 0) return []
  return pairs
    .filter((item) => {
      const name = normalizeText(item.pair)
      return words.every((word) => name.includes(word))
    })
    .slice(0, limit)
}

function plays(match: Pick<FixtureMatch, 'entryA' | 'entryB'>, entryId: string): boolean {
  return match.entryA === entryId || match.entryB === entryId
}

// The side of `match` that waits for the winner of `feederId`.
function fedSide(match: FixtureMatch, feederId: string): 'a' | 'b' | null {
  if (match.sourceA?.kind === 'winner' && match.sourceA.matchId === feederId) return 'a'
  if (match.sourceB?.kind === 'winner' && match.sourceB.matchId === feederId) return 'b'
  return null
}

function situation(category: ChampionshipCategory, entry: ChampionshipEntry, fixture: Fixture): string {
  if (entry.status === 'waiting') return entryStateText(category, entry)
  const knockout = fixture.matches.filter((match) => match.categoryId === category.id && match.stage === 'knockout')
  const own = knockout.filter((match) => plays(match, entry.id))
  if (own.some((match) => isDone(match) && match.winner !== entry.id)) return 'Eliminada'
  const final = knockout.find((match) => match.round === 1)
  if (final && isDone(final) && final.winner === entry.id) return 'Campeona'
  const next = own.find((match) => !isDone(match))
  if (next) return `En la llave · ${knockoutLabel(next.round ?? 1, next.position ?? 1)}`
  const group = fixture.groups.find(
    (item) => item.categoryId === category.id && item.members.some((member) => member.entryId === entry.id),
  )
  if (!group) return ENTRY_STATUS_LABELS.active
  const place = group.members.find((member) => member.entryId === entry.id)?.place ?? null
  if (place === null) return `En la ${group.name}`
  if (knockout.length === 0) return place === 1 ? 'Campeona' : `Terminó ${place}° en la ${group.name}`
  return place > category.qualifiers ? 'Eliminada' : `Clasificada a la llave (${place}° de la ${group.name})`
}

// Where a pair is in the bracket: its match still to play, its rival and, if it wins, the next one.
function bracketOf(fixture: Fixture, views: MatchView[], entryId: string): CardBracket | null {
  const current = fixture.matches.find((match) => match.stage === 'knockout' && !isDone(match) && plays(match, entryId))
  const view = current ? views.find((item) => item.id === current.id) : undefined
  if (!current || !view) return null
  const following = fixture.matches.find((match) => fedSide(match, current.id) !== null)
  const followingView = following ? views.find((item) => item.id === following.id) : undefined
  const next =
    following && followingView
      ? `Si gana: ${followingView.name} contra ${fedSide(following, current.id) === 'a' ? followingView.sideB : followingView.sideA}`
      : null
  return { match: view.name, rival: current.entryA === entryId ? view.sideB : view.sideA, next }
}

// One card per pair with a place or waiting, in each open category. rows: the club's pairs table
// (pairsCategories); without it the cards have no private data.
export function pairCards(input: CardInput, rows?: PairRow[]): PairCard[] {
  const clubRows = new Map((rows ?? []).map((row) => [row.entryId, row]))
  return openCategories(input.championship).flatMap((category) =>
    category.entries
      .filter((entry) => entry.status === 'active' || entry.status === 'waiting')
      .map((entry): PairCard => {
        const pair = pairName(entry)
        const own = input.views.filter((view) => plays(view, entry.id))
        const row = clubRows.get(entry.id)
        return {
          entryId: entry.id,
          categoryId: category.id,
          categoryName: category.name,
          pair,
          label: `${pair} · ${category.name}`,
          situation: situation(category, entry, input.fixture),
          live: own.filter((view) => view.status === 'playing'),
          upcoming: own.filter((view) => view.status === 'scheduled'),
          played: own.filter((view) => isDone(view)),
          zone: input.zones.find((zone) => zone.rows.some((item) => item.entryId === entry.id)) ?? null,
          bracket: bracketOf(input.fixture, input.views, entry.id),
          private: row
            ? {
                phones: row.phones,
                paymentState: row.paymentState,
                charge: row.status === 'active' && row.paymentState === 'pending' && row.due > 0 ? row.due : null,
                hoursText: row.hoursText,
              }
            : null,
        }
      }),
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run tests/unit/lib/domain/championship-search.test.ts
npm run typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/championship-search.ts tests/unit/lib/domain/championship-search.test.ts
git commit -m "feat: search a player and build the card of the pair"
```

---

## Corte 3: Pantallas

### Task 6: El set en curso en el marcador, la fila resaltada y las pestañas como links

**Files:**
- Modify: `components/championships/match-line.tsx`, `components/championships/zones-view.tsx`
- Create: `components/ui/tab-links.tsx`
- Test: `tests/unit/components/championships/match-line.test.tsx`, `tests/unit/components/ui/tab-links.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/components/championships/match-line.test.tsx`:
```tsx

describe('MatchLine live', () => {
  it('marks the set being played', () => {
    render(
      <MatchLine
        match={makeView({
          status: 'playing',
          statusLabel: 'En juego',
          score: '6-4 2-1',
          sets: [
            { a: 6, b: 4, superTiebreak: false, inProgress: false },
            { a: 2, b: 1, superTiebreak: false, inProgress: true },
          ],
        })}
      />,
    )
    const [a, b] = screen.getAllByRole('row')
    expect(within(a).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['6', '2'])
    expect(within(a).getByRole('cell', { name: '2 (set en juego)' })).toHaveAttribute('data-live', 'true')
    expect(within(a).getAllByRole('cell')[0]).not.toHaveAttribute('data-live')
    expect(within(b).getByRole('cell', { name: '1 (set en juego)' })).toBeInTheDocument()
  })
})
```

`tests/unit/components/ui/tab-links.test.tsx`:
```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TabLinks } from '@/components/ui/tab-links'

describe('TabLinks', () => {
  it('links every tab and marks the current one', () => {
    render(
      <TabLinks
        label="Secciones del campeonato"
        current="fixture"
        items={[
          { key: 'hoy', label: 'Hoy', href: '/club/torneos/campeonatos/ch1?ver=hoy' },
          { key: 'fixture', label: 'Fixture', href: '/club/torneos/campeonatos/ch1?ver=fixture' },
        ]}
      />,
    )
    const nav = screen.getByRole('navigation', { name: 'Secciones del campeonato' })
    expect(within(nav).getByRole('link', { name: 'Fixture' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Hoy' })).not.toHaveAttribute('aria-current')
    expect(within(nav).getByRole('link', { name: 'Hoy' })).toHaveAttribute('href', '/club/torneos/campeonatos/ch1?ver=hoy')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/components/championships/match-line.test.tsx tests/unit/components/ui/tab-links.test.tsx`
Expected: FAIL (no cell named `2 (set en juego)`; `Cannot find module '@/components/ui/tab-links'`).

- [ ] **Step 3: El set en curso en `MatchLine`**

In `components/championships/match-line.tsx`, replace:
```tsx
            {side.games.map((games, index) => (
              <span
                key={index}
                role="cell"
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-lg font-display text-lg font-bold tabular-nums',
                  games > side.rival[index] ? 'bg-accent text-on-accent' : 'bg-surface text-fg-muted ring-1 ring-border',
                  large && 'size-14 text-4xl',
                )}
              >
                {games}
              </span>
            ))}
```
with:
```tsx
            {side.games.map((games, index) => {
              // The set being played: amber border, no winner yet, and the "en vivo" dot on the first row.
              const live = match.sets[index]?.inProgress === true
              return (
                <span
                  key={index}
                  role="cell"
                  data-live={live || undefined}
                  aria-label={live ? `${games} (set en juego)` : undefined}
                  className={cn(
                    'relative grid size-8 shrink-0 place-items-center rounded-lg font-display text-lg font-bold tabular-nums',
                    live
                      ? 'bg-bg text-fg ring-2 ring-accent'
                      : games > side.rival[index]
                        ? 'bg-accent text-on-accent'
                        : 'bg-surface text-fg-muted ring-1 ring-border',
                    large && 'size-14 text-4xl',
                  )}
                >
                  {games}
                  {live && side.key === 'a' ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute -right-1 -top-1 size-2.5 rounded-full bg-accent motion-safe:animate-pulse',
                        large && 'size-4',
                      )}
                    />
                  ) : null}
                </span>
              )
            })}
```

- [ ] **Step 4: La fila de una pareja resaltada en su zona**

In `components/championships/zones-view.tsx`, replace:
```tsx
export function ZonesView({ zones, footer }: { zones: ZoneView[]; footer?: (zone: ZoneView) => ReactNode }) {
```
with:
```tsx
// highlight: the pair whose card is open (the player search).
export function ZonesView({
  zones,
  footer,
  highlight,
}: {
  zones: ZoneView[]
  footer?: (zone: ZoneView) => ReactNode
  highlight?: string
}) {
```

In `components/championships/zones-view.tsx`, replace:
```tsx
                <tr key={row.entryId} className="border-t border-border align-middle">
```
with:
```tsx
                <tr
                  key={row.entryId}
                  aria-current={row.entryId === highlight ? 'true' : undefined}
                  className={cn('border-t border-border align-middle', row.entryId === highlight && 'bg-accent/15')}
                >
```

- [ ] **Step 5: Pestañas que son links**

`components/ui/tab-links.tsx`:
```tsx
import Link from 'next/link'
import { cn } from '@/lib/cn'

export type TabLink = { key: string; label: string; href: string }

// Tabs that are links (?ver=…): each one has its own address, the back button works and the server renders only the
// one shown. On a phone the bar slides sideways.
export function TabLinks({ label, items, current }: { label: string; items: TabLink[]; current: string }) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
      <ul className="flex gap-2 md:flex-wrap">
        {items.map((item) => (
          <li key={item.key} className="shrink-0">
            <Link
              href={item.href}
              aria-current={item.key === current ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center rounded-full border px-4 font-semibold focus-visible:outline-2 focus-visible:outline-accent',
                item.key === current ? 'border-accent bg-accent text-on-accent' : 'border-border hover:border-accent',
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/components/championships/match-line.test.tsx tests/unit/components/championships/zones-and-brackets.test.tsx tests/unit/components/ui/tab-links.test.tsx
npm run typecheck
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/championships/match-line.tsx components/championships/zones-view.tsx components/ui/tab-links.tsx tests/unit/components/championships/match-line.test.tsx tests/unit/components/ui/tab-links.test.tsx
git commit -m "feat: the set being played on the scoreboard, a highlighted row and tabs as links"
```

---

### Task 7: El marcador en vivo en el día del torneo

**Files:**
- Modify: `app/(club)/club/torneos/campeonatos/fixture-actions.ts` (al final)
- Modify: `components/championships/match-day-board.tsx`
- Test: `tests/unit/lib/actions/championship-fixture-actions.test.ts`, `tests/unit/components/championships/match-day-board.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/lib/actions/championship-fixture-actions.test.ts`:
```ts

describe('the live score', () => {
  it('adds a game to side a or b, and nothing else', async () => {
    expect(await actions.scoreGame(IDLE, form({ matchId: MATCH, side: 'c' }))).toEqual(INVALID_INPUT)
    expect(await actions.scoreGame(IDLE, form({ matchId: 'nope', side: 'a' }))).toEqual(INVALID_INPUT)
    expect(rpc).not.toHaveBeenCalled()
    expect(await actions.scoreGame(IDLE, form({ matchId: MATCH, side: 'b' }))).toMatchObject({ status: 'ok' })
    expect(rpc).toHaveBeenCalledWith('score_live_game', { p_match_id: MATCH, p_side: 'b' })
  })

  it('takes the last game back', async () => {
    expect(await actions.undoGame(IDLE, form({ matchId: MATCH }))).toMatchObject({ status: 'ok' })
    expect(rpc).toHaveBeenCalledWith('undo_live_game', { p_match_id: MATCH })
  })
})
```

In `tests/unit/components/championships/match-day-board.test.tsx`, replace:
```tsx
  return { start: vi.fn<FormAction>(ok), result: vi.fn<FormAction>(ok), walkover: vi.fn<FormAction>(ok) }
```
with:
```tsx
  return {
    start: vi.fn<FormAction>(ok),
    result: vi.fn<FormAction>(ok),
    walkover: vi.fn<FormAction>(ok),
    score: vi.fn<FormAction>(ok),
    undo: vi.fn<FormAction>(ok),
  }
```

Append to `tests/unit/components/championships/match-day-board.test.tsx`:
```tsx

describe('MatchDayBoard live score', () => {
  it('adds a game to a pair and takes the last one back', async () => {
    const steps = actions()
    render(
      <MatchDayBoard
        championshipId="ch1"
        playing={[
          makeView({
            status: 'playing',
            statusLabel: 'En juego',
            sets: [{ a: 2, b: 1, superTiebreak: false, inProgress: true }],
          }),
        ]}
        upcoming={[]}
        finished={[]}
        rules={RULES}
        actions={steps}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: '+1 Bruno y Lucía' }))
    await waitFor(() => expect(steps.score).toHaveBeenCalled())
    const form = vi.mocked(steps.score).mock.calls[0][1]
    expect([form.get('matchId'), form.get('side')]).toEqual(['m1', 'b'])
    await userEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    await waitFor(() => expect(steps.undo).toHaveBeenCalled())
    expect(vi.mocked(steps.undo).mock.calls[0][1].get('matchId')).toBe('m1')
    expect(screen.queryByRole('button', { name: /^Terminar partido/ })).not.toBeInTheDocument()
  })

  it('ends a decided match with its sets', async () => {
    const steps = actions()
    render(
      <MatchDayBoard
        championshipId="ch1"
        playing={[
          makeView({
            status: 'playing',
            statusLabel: 'En juego',
            sets: [
              { a: 6, b: 4, superTiebreak: false, inProgress: false },
              { a: 6, b: 3, superTiebreak: false, inProgress: false },
            ],
          }),
        ]}
        upcoming={[]}
        finished={[]}
        rules={RULES}
        actions={steps}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Terminar partido con 6-4 6-3' }))
    await waitFor(() => expect(steps.result).toHaveBeenCalled())
    const form = vi.mocked(steps.result).mock.calls[0][1]
    expect(['championshipId', 'matchId', 'a1', 'b1', 'a2', 'b2', 'a3', 'b3'].map((key) => form.get(key))).toEqual([
      'ch1',
      'm1',
      '6',
      '4',
      '6',
      '3',
      '',
      '',
    ])
    expect(await screen.findByRole('status')).toHaveTextContent('Listo.')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/actions/championship-fixture-actions.test.ts tests/unit/components/championships/match-day-board.test.tsx`
Expected: FAIL (`actions.scoreGame is not a function`; no button `+1 Bruno y Lucía`).

- [ ] **Step 3: Las acciones**

Append to `app/(club)/club/torneos/campeonatos/fixture-actions.ts`:
```ts

// "+1": a game for one pair of a match being played; the database closes the sets (private.live_sets).
export async function scoreGame(_previous: ActionState, form: FormData): Promise<ActionState> {
  const side = form.get('side')
  if (side !== 'a' && side !== 'b') return INVALID_INPUT
  return onId(
    form,
    'matchId',
    (supabase, id) => supabase.rpc('score_live_game', { p_match_id: id, p_side: side }),
    'Game sumado.',
  )
}

// "Deshacer": the last game loaded goes away.
export async function undoGame(_previous: ActionState, form: FormData): Promise<ActionState> {
  return onId(form, 'matchId', (supabase, id) => supabase.rpc('undo_live_game', { p_match_id: id }), 'Game borrado.')
}
```

- [ ] **Step 4: "+1", "Deshacer" y "Terminar partido" en el tablero**

In `components/championships/match-day-board.tsx`, replace:
```tsx
import type { MatchRules } from '@/lib/domain/championship-results'
```
with:
```tsx
import { liveFinish } from '@/lib/domain/championship-live'
import type { MatchRules } from '@/lib/domain/championship-results'
```

In `components/championships/match-day-board.tsx`, replace:
```tsx
export type DayBoardActions = { start: FormAction; result: FormAction; walkover: FormAction }
```
with:
```tsx
export type DayBoardActions = {
  start: FormAction
  result: FormAction
  walkover: FormAction
  score: FormAction
  undo: FormAction
}
```

In `components/championships/match-day-board.tsx`, replace:
```tsx
// Design: "Día del torneo": "En juego ahora" and "Próximos" with "Empezar", "Cargar resultado" and "W.O.", and
// the last ones played, to correct a result.
```
with:
```tsx
// Design: "Día del torneo": "En juego ahora" with the live score ("+1" for each pair, "Deshacer" and, once the score
// is a result, "Terminar partido"), "Próximos" with "Empezar", "Cargar resultado" and "W.O.", and the last ones
// played, to correct a result.
```

In `components/championships/match-day-board.tsx`, replace:
```tsx
  const done = useCallback((message: string) => {
    setSheet(null)
    setNotice(message)
  }, [])
```
with:
```tsx
  const done = useCallback((message: string) => {
    setSheet(null)
    setNotice(message)
  }, [])
  // A game loaded says nothing (the score is the answer) and clears the last notice.
  const quiet = useCallback(() => setNotice(null), [])
```

In `components/championships/match-day-board.tsx`, replace:
```tsx
  return (
    <div className="flex flex-col gap-4">
      {notice ? <p role="status">{notice}</p> : null}
      {list('playing', 'En juego ahora', playing, 'No hay partidos en juego.', resultButtons)}
```
with:
```tsx
  const liveButtons = (match: MatchView) => {
    const finish = liveFinish(match.sets, rules[match.categoryId] ?? DEFAULT_RULES)
    return (
      <div className="flex w-full flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          {(['a', 'b'] as const).map((side) => (
            <ActionForm
              key={side}
              action={actions.score}
              submitLabel={`+1 ${side === 'a' ? match.sideA : match.sideB}`}
              pendingLabel="Sumando…"
              onDone={quiet}
            >
              <input type="hidden" name="matchId" value={match.id} />
              <input type="hidden" name="side" value={side} />
            </ActionForm>
          ))}
        </div>
        {finish ? (
          <ActionForm action={actions.result} submitLabel={finish.label} pendingLabel="Guardando…" onDone={setNotice}>
            <input type="hidden" name="championshipId" value={championshipId} />
            <input type="hidden" name="matchId" value={match.id} />
            {[1, 2, 3].flatMap((number) => [
              <input key={`a${number}`} type="hidden" name={`a${number}`} value={finish.sets[number - 1]?.[0] ?? ''} />,
              <input key={`b${number}`} type="hidden" name={`b${number}`} value={finish.sets[number - 1]?.[1] ?? ''} />,
            ])}
          </ActionForm>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {match.sets.length > 0 ? (
            <ActionForm action={actions.undo} submitLabel="Deshacer" pendingLabel="Deshaciendo…" variant="ghost" onDone={quiet}>
              <input type="hidden" name="matchId" value={match.id} />
            </ActionForm>
          ) : null}
          {resultButtons(match)}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {notice ? <p role="status">{notice}</p> : null}
      {list('playing', 'En juego ahora', playing, 'No hay partidos en juego.', liveButtons)}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/lib/actions/championship-fixture-actions.test.ts tests/unit/components/championships/match-day-board.test.tsx
npm run typecheck
```
Expected: PASS en Vitest. Typecheck falla solo en `app/(club)/club/torneos/campeonatos/[id]/page.tsx` (`actions` sin `score` ni `undo`): lo arregla la Task 9. No commitear con otro error que ese.

- [ ] **Step 6: Commit**

```bash
git add "app/(club)/club/torneos/campeonatos/fixture-actions.ts" components/championships/match-day-board.tsx tests/unit/lib/actions/championship-fixture-actions.test.ts tests/unit/components/championships/match-day-board.test.tsx
git commit -m "feat: live score on the tournament day board (+1, Deshacer, Terminar partido)"
```

---

### Task 8: El buscador de jugador y la ficha

**Files:**
- Create: `components/championships/pair-card-view.tsx`, `components/championships/player-search.tsx`
- Test: `tests/unit/components/championships/player-search.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/championships/player-search.test.tsx`:
```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlayerSearch } from '@/components/championships/player-search'
import type { FormAction } from '@/components/ui/action-form'
import type { PairCard } from '@/lib/domain/championship-search'
import { makeView, makeZone } from '../../fixtures/championship-views'

const ok = async () => ({ status: 'ok' as const, message: 'Listo.' })

// Ana Pérez and Pedro Viera in 6ta Libre: Zona A played, the semifinal next.
function makeCard(overrides: Partial<PairCard> = {}): PairCard {
  return {
    entryId: 'e1',
    categoryId: 'k1',
    categoryName: '6ta Libre',
    pair: 'Ana Pérez y Pedro Viera',
    label: 'Ana Pérez y Pedro Viera · 6ta Libre',
    situation: 'En la llave · Semifinal 1',
    live: [],
    upcoming: [makeView({ id: 's1', name: 'Semifinal 1', stage: 'knockout', groupId: null, sideA: 'Ana Pérez y Pedro Viera', time: '14:00' })],
    played: [
      makeView({
        sideA: 'Ana Pérez y Pedro Viera',
        status: 'finished',
        statusLabel: 'Terminado',
        winner: 'a',
        score: '6-3 6-3',
        sets: [
          { a: 6, b: 3, superTiebreak: false, inProgress: false },
          { a: 6, b: 3, superTiebreak: false, inProgress: false },
        ],
      }),
    ],
    zone: makeZone({
      rows: [
        { entryId: 'e1', name: 'Ana Pérez y Pedro Viera', played: 1, won: 1, lost: 0, sets: '2-0', games: '12-6' },
        { entryId: 'e2', name: 'Bruno y Lucía', played: 1, won: 0, lost: 1, sets: '0-2', games: '6-12' },
      ],
    }),
    bracket: { match: 'Semifinal 1', rival: 'Bruno y Lucía', next: 'Si gana: Final contra Ganador SF2' },
    private: null,
    ...overrides,
  }
}
const BRUNO_CARD = makeCard({ entryId: 'e2', pair: 'Bruno y Lucía', label: 'Bruno y Lucía · 6ta Libre' })

describe('PlayerSearch', () => {
  it('finds a pair while typing and opens its card', async () => {
    render(<PlayerSearch pairs={[makeCard(), BRUNO_CARD]} />)
    await userEvent.type(screen.getByLabelText('Buscar jugador'), 'perez')
    expect(screen.queryByRole('button', { name: 'Bruno y Lucía · 6ta Libre' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ana Pérez y Pedro Viera · 6ta Libre' }))
    const card = screen.getByRole('dialog', { name: 'Ana Pérez y Pedro Viera' })
    expect(card).toHaveTextContent('En la llave · Semifinal 1')
    expect(card).toHaveTextContent('Semifinal 1 contra Bruno y Lucía')
    expect(card).toHaveTextContent('Si gana: Final contra Ganador SF2')
    expect(within(card).getByRole('region', { name: 'Próximos' })).toHaveTextContent('14:00')
    expect(within(card).getByRole('region', { name: 'Jugados' })).toBeInTheDocument()
    expect(within(card).getByRole('row', { current: true })).toHaveTextContent('Ana Pérez y Pedro Viera')
    expect(within(card).queryByRole('region', { name: 'Datos del club' })).not.toBeInTheDocument()
  })

  it('says when nobody matches', async () => {
    render(<PlayerSearch pairs={[makeCard()]} />)
    await userEvent.type(screen.getByLabelText('Buscar jugador'), 'zzz')
    expect(screen.getByText('No encontramos a nadie con ese nombre.')).toBeInTheDocument()
  })

  it('shows the club the payment, the hours and the phones, and charges', async () => {
    const cash = vi.fn<FormAction>(ok)
    render(
      <PlayerSearch
        pairs={[
          makeCard({
            private: { phones: '099111001', paymentState: 'pending', charge: 2000, hoursText: 'No pueden en 1 franja.' },
          }),
        ]}
        cash={{ action: cash, acceptsCash: true }}
      />,
    )
    await userEvent.type(screen.getByLabelText('Buscar jugador'), 'ana')
    await userEvent.click(screen.getByRole('button', { name: 'Ana Pérez y Pedro Viera · 6ta Libre' }))
    const club = within(screen.getByRole('dialog')).getByRole('region', { name: 'Datos del club' })
    expect(club).toHaveTextContent('Teléfonos: 099111001')
    expect(club).toHaveTextContent('No pueden en 1 franja.')
    await userEvent.click(within(club).getByRole('button', { name: 'Cobrar $2.000' }))
    await waitFor(() => expect(cash).toHaveBeenCalled())
    const form = cash.mock.calls[0][1]
    expect([form.get('entryId'), form.get('amount')]).toEqual(['e1', '2000'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/championships/player-search.test.tsx`
Expected: FAIL (`Cannot find module '@/components/championships/player-search'`).

- [ ] **Step 3: La ficha**

`components/championships/pair-card-view.tsx`:
```tsx
'use client'

import { PaymentBadge } from '@/components/booking/payment-badge'
import { MatchLine } from '@/components/championships/match-line'
import { ZonesView } from '@/components/championships/zones-view'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import type { PairCard } from '@/lib/domain/championship-search'
import { formatPrice } from '@/lib/domain/format'

export type CashOption = { action: FormAction; acceptsCash: boolean }

// Design: "la ficha": the pair, its category and situation; its matches (in play, next with day, time and court,
// played with their score); its group with its row highlighted; where it is in the bracket. The club's card adds
// the payment with "Cobrar", the hours it cannot play and the phones.
export function PairCardView({ card, cash }: { card: PairCard; cash?: CashOption }) {
  const sections = [
    { title: 'En juego ahora', matches: card.live },
    { title: 'Próximos', matches: card.upcoming },
    { title: 'Jugados', matches: card.played },
  ].filter((section) => section.matches.length > 0)

  return (
    <div className="flex flex-col gap-4">
      <p className="flex flex-wrap items-center gap-2">
        <span className="text-fg-muted">{card.categoryName}</span>
        <span className="rounded-full border border-accent px-2.5 py-0.5 text-sm font-semibold">{card.situation}</span>
      </p>
      {card.bracket ? (
        <section aria-label="En la llave" className="flex flex-col gap-1">
          <p className="font-semibold">{`${card.bracket.match} contra ${card.bracket.rival}`}</p>
          {card.bracket.next ? <p className="text-sm text-fg-muted">{card.bracket.next}</p> : null}
        </section>
      ) : null}
      {sections.map((section) => (
        <section key={section.title} aria-label={section.title} className="flex flex-col gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-fg-muted">{section.title}</h3>
          <ul className="flex flex-col gap-2">
            {section.matches.map((match) => (
              <li key={match.id} className="rounded-2xl border border-border bg-bg p-3">
                <MatchLine match={match} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {card.zone ? <ZonesView zones={[card.zone]} highlight={card.entryId} /> : null}
      {card.private ? (
        <section aria-label="Datos del club" className="flex flex-col gap-2 border-t border-border pt-3">
          <p className="flex items-center gap-2">
            Pago <PaymentBadge state={card.private.paymentState} />
          </p>
          {cash?.acceptsCash && card.private.charge !== null ? (
            <ActionForm
              action={cash.action}
              submitLabel={`Cobrar ${formatPrice(card.private.charge)}`}
              pendingLabel="Registrando…"
              variant="secondary"
            >
              <input type="hidden" name="entryId" value={card.entryId} />
              <input type="hidden" name="amount" value={card.private.charge} />
            </ActionForm>
          ) : null}
          <p className="text-sm">{card.private.hoursText}</p>
          {card.private.phones ? <p className="text-sm">{`Teléfonos: ${card.private.phones}`}</p> : null}
        </section>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: El buscador**

`components/championships/player-search.tsx`:
```tsx
'use client'

import { useCallback, useId, useState } from 'react'
import { PairCardView, type CashOption } from '@/components/championships/pair-card-view'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Field, inputClasses } from '@/components/ui/field'
import { searchPairs, type PairCard } from '@/lib/domain/championship-search'

// Design: "Buscar jugador": the pairs show while typing (every word, no accents), each with its category; a pair
// opens its card. cash: the club's "Cobrar" (the public page has none).
export function PlayerSearch({ pairs, cash }: { pairs: PairCard[]; cash?: CashOption }) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const close = useCallback(() => setOpenId(null), [])
  const hits = searchPairs(pairs, query)
  const card = pairs.find((item) => item.entryId === openId) ?? null

  return (
    <div role="search" className="flex flex-col gap-2">
      <Field label="Buscar jugador" htmlFor={`${id}-query`}>
        <input
          id={`${id}-query`}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nombre o apellido"
          autoComplete="off"
          className={inputClasses}
        />
      </Field>
      {query.trim() === '' ? null : hits.length === 0 ? (
        <p className="text-sm text-fg-muted">No encontramos a nadie con ese nombre.</p>
      ) : (
        <ul aria-label="Resultados" className="flex flex-col gap-1">
          {hits.map((hit) => (
            <li key={hit.entryId}>
              <button
                type="button"
                onClick={() => setOpenId(hit.entryId)}
                className="flex min-h-11 w-full items-center rounded-xl border border-border bg-surface px-3 text-left hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
              >
                {hit.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <BottomSheet open={card !== null} onClose={close} title={card?.pair ?? ''}>
        {card ? <PairCardView card={card} cash={cash} /> : null}
      </BottomSheet>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/championships/player-search.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/championships/pair-card-view.tsx components/championships/player-search.tsx tests/unit/components/championships/player-search.test.tsx
git commit -m "feat: player search with the card of the pair"
```

---

### Task 9: La página del club en pestañas

**Files:**
- Modify: `components/championships/championship-controls.tsx`
- Modify: `app/(club)/club/torneos/campeonatos/[id]/page.tsx`
- Test: `tests/unit/components/championships/championship-controls.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/components/championships/championship-controls.test.tsx`:
```tsx

describe('ChampionshipControls in parts', () => {
  it('shows the steps without cancelling, or only cancelling', () => {
    const { unmount } = render(
      <ChampionshipControls championshipId="ch1" status="registration" readiness={null} actions={actions()} part="steps" />,
    )
    expect(screen.getByRole('button', { name: 'Cerrar inscripción' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar campeonato' })).not.toBeInTheDocument()
    unmount()
    render(<ChampionshipControls championshipId="ch1" status="registration" readiness={null} actions={actions()} part="cancel" />)
    expect(screen.queryByRole('button', { name: 'Cerrar inscripción' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar campeonato' })).toBeInTheDocument()
  })

  it('renders nothing when its part has nothing to offer', () => {
    const { container } = render(
      <ChampionshipControls championshipId="ch1" status="in_progress" readiness={null} actions={actions()} part="steps" />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/championships/championship-controls.test.tsx`
Expected: FAIL (the `steps` part still shows "Cancelar campeonato").

- [ ] **Step 3: Pasos y "Cancelar campeonato" por separado**

In `components/championships/championship-controls.tsx`, replace:
```tsx
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
with:
```tsx
// Design: "Gestión": "Abrir inscripción", "Cerrar inscripción", "Cancelar campeonato"; only the step that fits.
// part: the championship page shows the steps in its header and "Cancelar campeonato" apart, at the end of Ajustes.
export function ChampionshipControls({
  championshipId,
  status,
  readiness,
  actions,
  part = 'all',
}: {
  championshipId: string
  status: ChampionshipStatus
  readiness: string | null
  actions: ControlActions
  part?: 'all' | 'steps' | 'cancel'
}) {
  const [confirmCancel, setConfirmCancel] = useState(false)
  const steps = part !== 'cancel' && (status === 'draft' || status === 'registration')
  const cancellable = part !== 'steps' && status !== 'finished' && status !== 'cancelled'
  if (!steps && !cancellable) return null

  return (
    <section aria-label="Acciones del campeonato" className="flex flex-col gap-3">
      {steps && status === 'draft' && readiness ? <p className="text-sm text-fg-muted">{readiness}</p> : null}
      {steps && status === 'draft' && !readiness ? (
        <>
          <p className="text-sm text-fg-muted">
            Al abrir la inscripción, las canchas de los días de juego quedan bloqueadas y los socios ya se pueden anotar.
          </p>
          <Step action={actions.open} championshipId={championshipId} label="Abrir inscripción" pendingLabel="Abriendo…" />
        </>
      ) : null}
      {steps && status === 'registration' ? (
        <Step action={actions.close} championshipId={championshipId} label="Cerrar inscripción" pendingLabel="Cerrando…" />
      ) : null}
      {cancellable ? (
        <>
          <Button variant="danger" fullWidth onClick={() => setConfirmCancel(true)}>
            Cancelar campeonato
          </Button>
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
        </>
      ) : null}
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/championships/championship-controls.test.tsx`
Expected: PASS (the four tests that were there and the two new ones).

- [ ] **Step 5: Las importaciones de la página**

In `app/(club)/club/torneos/campeonatos/[id]/page.tsx`, replace:
```tsx
  saveSeeds,
  scheduleFixture,
  startMatch,
} from '../fixture-actions'
```
with:
```tsx
  saveSeeds,
  scheduleFixture,
  scoreGame,
  startMatch,
  undoGame,
} from '../fixture-actions'
import { PlayerSearch } from '@/components/championships/player-search'
import { TabLinks } from '@/components/ui/tab-links'
import { pairCards } from '@/lib/domain/championship-search'
import { championshipTabs, pickTab, TAB_LABELS } from '@/lib/domain/championship-tabs'
```

- [ ] **Step 6: La página en pestañas** (no unit test — server page; la cubren el typecheck, el build y el e2e de la Task 11)

In `app/(club)/club/torneos/campeonatos/[id]/page.tsx`, replace:
```tsx
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
  if (!isUuid(id)) notFound()
  const viewer = await requireStaff(`/club/torneos/campeonatos/${id}`)
  const { club } = viewer
  const [championship, courts, phones, members] = await Promise.all([
    loadChampionship(club, id),
    loadActiveCourts(club),
    loadChampionshipPhones(id),
    loadMemberOptions(club.id),
  ])
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
              detail: `${categoryDetail(category)} · ${matchRulesText(category)}`,
            }))}
            addAction={addCategory}
            deleteAction={deleteCategory}
          />
        </>
      ) : null}
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
          categories={pairsCategories(championship, phones)}
          editable={championship.status === 'registration' || championship.status === 'closed'}
          acceptsCash={club.accepts_cash && championship.status !== 'cancelled'}
          members={members}
          blocks={championshipBlocks(championship.windows)}
          actions={{ cash: recordChampionshipCash, remove: removePair, move: movePair, add: addPair, hours: saveUnavailability }}
        />
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
      <LiveOccupancy clubId={club.id} />
    </>
  )
}
```
with:
```tsx
type SearchParams = Promise<{ partido?: string; ver?: string; categoria?: string }>

// The organizer's page of a championship, in tabs (?ver=hoy|fixture|zonas|parejas|ajustes): without one, or with
// one that does not fit the state, the tab its state calls for. The header stays on every tab: name, state, the
// next step, "Compartir", "Abrir modo TV" and "Buscar jugador". ?partido=<id> opens "Mover partido" on Fixture;
// ?categoria=<id> picks the category of "Zonas y llaves".
export default async function ManageChampionshipPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  const { id } = await params
  const { partido, ver, categoria } = await searchParams
  if (!isUuid(id)) notFound()
  const viewer = await requireStaff(`/club/torneos/campeonatos/${id}`)
  const { club } = viewer
  const [championship, courts, phones, members] = await Promise.all([
    loadChampionship(club, id),
    loadActiveCourts(club),
    loadChampionshipPhones(id),
    loadMemberOptions(club.id),
  ])
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
  const tab = pickTab(championship.status, partido ? 'fixture' : ver)
  const zones = zoneViews(championship, fixture)
  const allBrackets = brackets(championship, views)
  const pairs = pairsCategories(championship, phones)
  const cards = pairCards({ championship, fixture, views, zones }, pairs.flatMap((category) => category.rows))
  const zoneCategories = championship.categories.filter(
    (category) =>
      zones.some((zone) => zone.categoryId === category.id) ||
      allBrackets.some((bracket) => bracket.categoryId === category.id),
  )
  const zoneCategory = zoneCategories.find((category) => category.id === categoria) ?? zoneCategories[0] ?? null
  const controls = { open: openRegistration, close: closeRegistration, cancel: cancelChampionship }
  const steps = (
    <FixtureSteps
      championshipId={championship.id}
      status={championship.status}
      scheduled={fixture.matches.filter((match) => match.courtId !== null).length}
      unplaced={unplaced.length}
      finishable={finishable(fixture)}
      actions={{ draw: drawFixture, schedule: scheduleFixture, publish: publishFixture, finish: finishFixture }}
    />
  )

  return (
    <>
      <BackLink href="/club/torneos">Volver a torneos</BackLink>
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="font-display text-3xl font-bold uppercase">{championship.name}</h2>
            <span className="shrink-0 whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-xs font-semibold">
              {CHAMPIONSHIP_STATUS_LABELS[championship.status]}
            </span>
          </div>
          <p className="text-fg-muted">{datesText(championship)}</p>
          {deadline ? <p className="text-sm">Inscripción hasta el {deadline}.</p> : null}
        </div>
        <ChampionshipControls
          championshipId={championship.id}
          status={championship.status}
          readiness={championshipReadiness(championship)}
          actions={controls}
          part="steps"
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
        {cards.length > 0 ? (
          <PlayerSearch
            pairs={cards}
            cash={{ action: recordChampionshipCash, acceptsCash: club.accepts_cash && championship.status !== 'cancelled' }}
          />
        ) : null}
        <TabLinks
          label="Secciones del campeonato"
          current={tab}
          items={championshipTabs(championship.status).map((key) => ({
            key,
            label: TAB_LABELS[key],
            href: `${pagePath}?ver=${key}`,
          }))}
        />
      </header>

      {tab === 'hoy' ? (
        <section aria-labelledby="dia" className="flex flex-col gap-3">
          <h2 id="dia" className="font-display text-2xl font-bold uppercase">
            Día del torneo
          </h2>
          {steps}
          <MatchDayBoard
            championshipId={championship.id}
            playing={board.playing}
            upcoming={board.upcoming}
            finished={board.finished}
            rules={rules}
            actions={{
              start: startMatch,
              result: recordResult,
              walkover: recordWalkover,
              score: scoreGame,
              undo: undoGame,
            }}
          />
        </section>
      ) : null}

      {tab === 'fixture' ? (
        <>
          {championship.status === 'closed' ? (
            <section aria-labelledby="cabezas" className="flex flex-col gap-3">
              <h2 id="cabezas" className="font-display text-2xl font-bold uppercase">
                Cabezas de serie
              </h2>
              <p className="text-sm text-fg-muted">
                Las parejas van por la suma de las categorías que declararon (menor primero). Numerá las que quieras
                fijar: van una por zona.
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
          {steps}
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
        </>
      ) : null}

      {tab === 'zonas' ? (
        <section aria-labelledby="zonas" className="flex flex-col gap-3">
          <h2 id="zonas" className="font-display text-2xl font-bold uppercase">
            Zonas y llaves
          </h2>
          {zoneCategories.length > 1 ? (
            <TabLinks
              label="Categorías"
              current={zoneCategory?.id ?? ''}
              items={zoneCategories.map((category) => ({
                key: category.id,
                label: category.name,
                href: `${pagePath}?ver=zonas&categoria=${category.id}`,
              }))}
            />
          ) : null}
          {zoneCategory ? (
            <>
              <ZonesView
                zones={zones.filter((zone) => zone.categoryId === zoneCategory.id)}
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
              {allBrackets
                .filter((bracket) => bracket.categoryId === zoneCategory.id)
                .map((bracket) => (
                  <BracketView key={bracket.categoryId} bracket={bracket} />
                ))}
            </>
          ) : (
            <p className="text-fg-muted">Todavía no hay zonas ni llaves.</p>
          )}
        </section>
      ) : null}

      {tab === 'parejas' ? (
        <>
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
          <PairsBoard
            categories={pairs}
            editable={championship.status === 'registration' || championship.status === 'closed'}
            acceptsCash={club.accepts_cash && championship.status !== 'cancelled'}
            members={members}
            blocks={championshipBlocks(championship.windows)}
            actions={{ cash: recordChampionshipCash, remove: removePair, move: movePair, add: addPair, hours: saveUnavailability }}
          />
        </>
      ) : null}

      {tab === 'ajustes' ? (
        <>
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
                  detail: `${categoryDetail(category)} · ${matchRulesText(category)}`,
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
          <div className="mt-4 border-t border-border pt-6">
            <ChampionshipControls
              championshipId={championship.id}
              status={championship.status}
              readiness={null}
              actions={controls}
              part="cancel"
            />
          </div>
        </>
      ) : null}

      {moving ? (
        <MoveMatchSheet
          matchId={moving.id}
          title={`${moving.categoryName} · ${moving.name}: ${moving.sideA} vs ${moving.sideB}`}
          options={moveOptions}
          closeHref={`${pagePath}?ver=fixture`}
          action={moveMatch}
        />
      ) : null}
      <LiveOccupancy clubId={club.id} />
    </>
  )
}
```

- [ ] **Step 7: Verificar**

Run:
```bash
npm run typecheck
npm run lint
npm test
npm run build
```
Expected: todo PASS (el error de tipos de la Task 7 desaparece).

- [ ] **Step 8: Mirarla en el navegador**

Run: `npm run dev` y abrir, con la demo local (`npm run demo:data`), la "Copa de la Casa" en `/club/torneos/campeonatos/<id>`: abre en "Hoy"; las cinco pestañas cambian la dirección (`?ver=`) y en el celular (DevTools, 390 px) la barra se desliza sin mover la página; "Zonas y llaves" muestra una categoría a la vez; "Buscar jugador" encuentra a una pareja sin acentos y la ficha muestra pago y teléfonos; en "Hoy", "+1" suma y el set en curso tiene borde ámbar; "Cancelar campeonato" está al final de "Ajustes".

- [ ] **Step 9: Commit**

```bash
git add components/championships/championship-controls.tsx "app/(club)/club/torneos/campeonatos/[id]/page.tsx" tests/unit/components/championships/championship-controls.test.tsx
git commit -m "feat: championship page in tabs with the player search and the live score"
```

---

### Task 10: El buscador en la página pública

**Files:**
- Modify: `app/c/[code]/public-board.tsx`, `app/c/[code]/page.tsx`
- Test: `tests/unit/app/campeonatos/public-board.test.tsx`

- [ ] **Step 1: Write the failing test**

In `tests/unit/app/campeonatos/public-board.test.tsx`, replace:
```tsx
import { render, screen } from '@testing-library/react'
```
with:
```tsx
import { render, screen, within } from '@testing-library/react'
```

In `tests/unit/app/campeonatos/public-board.test.tsx`, replace:
```tsx
import { PublicBoard, type PublicCategory } from '@/app/c/[code]/public-board'
```
with:
```tsx
import { PublicBoard, type PublicCategory } from '@/app/c/[code]/public-board'
import type { PairCard } from '@/lib/domain/championship-search'
```

Append to `tests/unit/app/campeonatos/public-board.test.tsx`:
```tsx

const CARD: PairCard = {
  entryId: 'e1',
  categoryId: 'k1',
  categoryName: '6ta Libre',
  pair: 'Ana y Pedro',
  label: 'Ana y Pedro · 6ta Libre',
  situation: 'En la Zona A',
  live: [],
  upcoming: [makeView()],
  played: [],
  zone: makeZone(),
  bracket: null,
  private: null,
}

describe('PublicBoard search', () => {
  it('finds a pair and opens its card, without the club data', async () => {
    render(<PublicBoard name="Copa" subtitle="" categories={[LIBRE]} shareText="" tvHref="/c/copa-1a2b/tv" pairs={[CARD]} />)
    await userEvent.type(screen.getByLabelText('Buscar jugador'), 'pedro')
    await userEvent.click(screen.getByRole('button', { name: 'Ana y Pedro · 6ta Libre' }))
    const card = screen.getByRole('dialog', { name: 'Ana y Pedro' })
    expect(card).toHaveTextContent('En la Zona A')
    expect(within(card).queryByRole('region', { name: 'Datos del club' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/app/campeonatos/public-board.test.tsx`
Expected: FAIL (no field "Buscar jugador"; typecheck would also flag the unknown `pairs` prop).

- [ ] **Step 3: El buscador en `PublicBoard`**

In `app/c/[code]/public-board.tsx`, replace:
```tsx
import { ZonesView } from '@/components/championships/zones-view'
```
with:
```tsx
import { PlayerSearch } from '@/components/championships/player-search'
import { ZonesView } from '@/components/championships/zones-view'
```

In `app/c/[code]/public-board.tsx`, replace:
```tsx
import type { Bracket, DayGroup, ZoneView } from '@/lib/domain/championship-views'
```
with:
```tsx
import type { PairCard } from '@/lib/domain/championship-search'
import type { Bracket, DayGroup, ZoneView } from '@/lib/domain/championship-views'
```

In `app/c/[code]/public-board.tsx`, replace:
```tsx
  shareText,
  tvHref,
}: {
  name: string
  subtitle: string
  categories: PublicCategory[]
  shareText: string
  tvHref: string
}) {
```
with:
```tsx
  shareText,
  tvHref,
  pairs = [],
}: {
  name: string
  subtitle: string
  categories: PublicCategory[]
  shareText: string
  tvHref: string
  // "Buscar jugador": the cards of the pairs, without payments, hours or phones.
  pairs?: PairCard[]
}) {
```

In `app/c/[code]/public-board.tsx`, replace:
```tsx
        <Link href={tvHref} className={buttonClasses({ variant: 'secondary' })}>
          Modo TV
        </Link>
      </div>
```
with:
```tsx
        <Link href={tvHref} className={buttonClasses({ variant: 'secondary' })}>
          Modo TV
        </Link>
      </div>
      {pairs.length > 0 ? <PlayerSearch pairs={pairs} /> : null}
```

- [ ] **Step 4: La página arma las fichas públicas**

In `app/c/[code]/page.tsx`, replace:
```tsx
import { brackets, byDay, championshipShareText, matchViews, zoneViews } from '@/lib/domain/championship-views'
```
with:
```tsx
import { pairCards } from '@/lib/domain/championship-search'
import { brackets, byDay, championshipShareText, matchViews, zoneViews } from '@/lib/domain/championship-views'
```

In `app/c/[code]/page.tsx`, replace:
```tsx
  const allBrackets = brackets(championship, views)
```
with:
```tsx
  const allBrackets = brackets(championship, views)
  // Built without the club's pairs table: the public card has no payment, hours or phones.
  const pairs = pairCards({ championship, fixture, views, zones })
```

In `app/c/[code]/page.tsx`, replace:
```tsx
        tvHref={`/c/${data.code}/tv`}
```
with:
```tsx
        tvHref={`/c/${data.code}/tv`}
        pairs={pairs}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/unit/app/campeonatos/public-board.test.tsx
npm run typecheck
npm run lint
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/c/[code]/public-board.tsx" "app/c/[code]/page.tsx" tests/unit/app/campeonatos/public-board.test.tsx
git commit -m "feat: player search on the public championship page"
```

---

## Corte 4: e2e y cierre

### Task 11: Flujo e2e: marcador en vivo, página pública y buscador

**Files:**
- Modify: `tests/e2e/support/championships.ts` (al final)
- Modify: `tests/e2e/championship-day.spec.ts`

- [ ] **Step 1: Soporte para cargar games**

Append to `tests/e2e/support/championships.ts`:
```ts

// Live games through score_live_game, as staff: one per letter ('aab' = a, a, b).
export async function scoreGamesAs(user: TestUser, matchId: string, sides: string): Promise<void> {
  const client = await signedInClient(user)
  for (const side of sides) {
    const { error } = await client.rpc('score_live_game', { p_match_id: matchId, p_side: side })
    if (error) throw error
  }
}
```

- [ ] **Step 2: El flujo con pestañas, el marcador en vivo y el buscador**

In `tests/e2e/championship-day.spec.ts`, replace:
```ts
import { fixtureMatches, pairNumbers, publicCode, recordResultAs, registerPairAs, uniquePhone } from './support/championships'
```
with:
```ts
import {
  fixtureMatches,
  pairNumbers,
  publicCode,
  recordResultAs,
  registerPairAs,
  scoreGamesAs,
  uniquePhone,
} from './support/championships'
```

In `tests/e2e/championship-day.spec.ts`, replace:
```ts
test('campeonato: the organizer draws, schedules and publishes, loads the group, and the public page follows it', async ({ page }) => {
  test.setTimeout(240_000)
```
with:
```ts
test('campeonato: the organizer draws, schedules and publishes, loads the group and the final live, and the public page follows it', async ({ page, browser }) => {
  test.setTimeout(300_000)
```

In `tests/e2e/championship-day.spec.ts`, replace:
```ts
  await page.getByRole('button', { name: 'Sortear' }).click()
  await expect(page.getByRole('heading', { name: 'Zona A' })).toBeVisible()
```
with:
```ts
  await page.getByRole('button', { name: 'Sortear' }).click()
  // Drawn: the page stays on Fixture (the groups are on "Zonas y llaves").
  await expect(page.getByRole('button', { name: 'Programar' })).toBeVisible()
```

In `tests/e2e/championship-day.spec.ts`, replace:
```ts
  // The 1st and the 2nd of the group are in the final.
  const bracket = page.getByRole('region', { name: 'Llave de 6ta Fixture' })
  await expect(bracket).toContainText(pair(1))
  await expect(bracket).toContainText(pair(2))
```
with:
```ts
  // The 1st and the 2nd of the group are in the final ("Zonas y llaves").
  await page.goto(`/club/torneos/campeonatos/${championshipId}?ver=zonas`)
  const bracket = page.getByRole('region', { name: 'Llave de 6ta Fixture' })
  await expect(bracket).toContainText(pair(1))
  await expect(bracket).toContainText(pair(2))

  // Reception starts the final ("Hoy") and loads it game by game: three on the screen, the rest through the API.
  await page.goto(`/club/torneos/campeonatos/${championshipId}`)
  await page
    .getByRole('region', { name: 'Próximos' })
    .getByRole('listitem')
    .filter({ hasText: 'Final' })
    .getByRole('button', { name: 'Empezar' })
    .click()
  const live = page.getByRole('region', { name: 'En juego ahora' })
  for (const games of [1, 2, 3]) {
    await live.getByRole('button', { name: `+1 ${pair(1)}`, exact: true }).click()
    await expect(live.getByRole('cell', { name: `${games} (set en juego)` })).toBeVisible()
  }
  const final = (await fixtureMatches(championshipId)).find((match) => match.stage === 'knockout')
  if (!final) throw new Error('El campeonato no tiene final')
  await scoreGamesAs(admin, final.id, 'aaaaa')

  // Not finished yet, the public page (no session) shows the score so far: 6-0, and 2-0 in the set being played.
  const code = await publicCode(championshipId)
  const viewer = await browser.newPage()
  await viewer.goto(new URL(`/c/${code}`, page.url()).toString())
  await expect(viewer.getByRole('cell', { name: '2 (set en juego)' }).first()).toBeVisible()
  await viewer.close()

  // Decided at 6-0 6-0: "Terminar partido" saves it and the winner shows in the bracket.
  await scoreGamesAs(admin, final.id, 'aaaa')
  await page.reload()
  await live.getByRole('button', { name: 'Terminar partido con 6-0 6-0' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Resultado guardado.' })).toBeVisible()
  await page.goto(`/club/torneos/campeonatos/${championshipId}?ver=zonas`)
  const champion = bracket.locator('[role="row"][data-winner="true"]')
  await expect(champion).toContainText(pair(1))
  await expect(champion).toContainText('Ganó')
```

In `tests/e2e/championship-day.spec.ts`, replace:
```ts
  // The public page, without a session.
  const code = await publicCode(championshipId)
  await page.context().clearCookies()
```
with:
```ts
  // The public page, without a session.
  await page.context().clearCookies()
```

In `tests/e2e/championship-day.spec.ts`, replace:
```ts
  await expect(winnerRow.getByRole('cell')).toHaveText(['6', '6'])
})
```
with:
```ts
  await expect(winnerRow.getByRole('cell')).toHaveText(['6', '6'])

  // "Buscar jugador": the champion's card, without payments or phones.
  await page.getByLabel('Buscar jugador').fill('socio 1')
  await page.getByRole('button', { name: `${pair(1)} · 6ta Fixture` }).click()
  const card = page.getByRole('dialog', { name: pair(1) })
  await expect(card).toContainText('Campeona')
  await expect(card.getByRole('region', { name: 'Datos del club' })).toHaveCount(0)
})
```

- [ ] **Step 3: Correr el flujo**

Run:
```bash
npm run db:reset
npx playwright test tests/e2e/championship-day.spec.ts tests/e2e/championship.spec.ts --workers=1
```
Expected: los dos PASS (`championship.spec.ts` sigue en verde: el borrador abre en "Ajustes", "Abrir inscripción" está en el encabezado y con la inscripción abierta la página abre en "Parejas").

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/support/championships.ts tests/e2e/championship-day.spec.ts
git commit -m "test(e2e): live score of the final, the public page follows it, and the player search"
```

---

### Task 12: Cierre

**Files:**
- Modify: `docs/features/campeonatos-gestion-en-vivo/notes.md`, `docs/features/campeonatos-gestion-en-vivo/plan.md` (revisiones)

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
Expected: todo PASS (pgTAP completo con `championship_live.test.sql`, Vitest, build y todos los flujos e2e).

- [ ] **Step 2: Revisión de disciplina**

Run `/team-setup:discipline-check` sobre la rama y arreglar lo que encuentre en commits aparte (con su test). Si algún arreglo toca la base, va en una migración nueva `20261008000120_*.sql` con su pgTAP. Mirar en especial: que `anon` siga ejecutando solo `public_championship` (`integrity.test.sql`) y que la ficha pública no lleve pagos, horarios ni teléfonos (`pairCards` sin filas del club); que `score_live_game` y `undo_live_game` pasen por `private.staff_match` (candado y staff) antes de leer games; que `private.live_sets` use `private.set_done` y no duplique reglas; que `private.apply_result` sea la copia exacta de `20261007000180` más el `delete` de los games; que `public_championship` sea la copia exacta de `20261007000170` más `in_progress`; y que `lib/domain` siga sin `Date.now()`.

- [ ] **Step 3: Notas de ejecución**

Append to `docs/features/campeonatos-gestion-en-vivo/notes.md` one dated entry per corte with the deviations from this plan (as in `../campeonatos-dia-del-torneo/notes.md`), and to the "Plan revisions" section of this file a `v3` line if the plan changed during execution.

```bash
git add docs/features/campeonatos-gestion-en-vivo/notes.md docs/features/campeonatos-gestion-en-vivo/plan.md
git commit -m "docs: campeonatos gestión en vivo execution notes"
git push
```

- [ ] **Step 4: PR listo**

Marcar el PR como listo desde GitHub y esperar CI en verde.
Expected: `quality` y `db-and-e2e` en verde.

- [ ] **Step 5: MANUAL (producción, después del merge)**

- MANUAL (Miguel): confirmar que `migrate.yml` aplicó `20261008000100` y `20261008000110` (`select version from supabase_migrations.schema_migrations order by version desc limit 2`).
- MANUAL: en el entorno de demo, abrir la "Copa de la Casa": pestañas en el celular, "Buscar jugador", "+1" en un partido en juego y la página pública / modo TV mostrando el set en curso.

---

## Acceptance criteria

- [ ] La página del campeonato del club tiene pestañas con link (`?ver=hoy|fixture|zonas|parejas|ajustes`, `aria-current`), solo las que corresponden al estado y, por defecto, la que pide el estado (borrador → Ajustes; inscripción → Parejas; cerrado o sorteado → Fixture; publicado o en juego → Hoy; finalizado → Zonas y llaves). En el celular la barra se desliza.
- [ ] El encabezado queda en todas: nombre, estado, "Abrir/Cerrar inscripción", "Compartir", "Abrir modo TV" y "Buscar jugador". "Zonas y llaves" muestra una categoría a la vez. "Cancelar campeonato" está al final de "Ajustes", aparte.
- [ ] "Buscar jugador" (club y pública) encuentra parejas mientras se escribe, sin acentos y con todas las palabras ("Ana Pérez y Pedro Viera · 6ta Libre"); un jugador en dos categorías aparece en las dos. La ficha muestra la situación, los partidos (jugados, en juego, próximos con día, hora y cancha), la zona con su fila resaltada y la llave (contra quién juega y, si gana, el siguiente). En el club, además, el pago con "Cobrar", los horarios imposibles y los teléfonos; la pública nunca.
- [ ] En "Hoy", cada partido en juego tiene "+1" por pareja y "Deshacer"; el set se cierra solo (6 con 2 de diferencia, 7-5, 7-6 después del 6-6; súper tie-break a 10 por 2); con el partido definido (o con límite de tiempo, apenas es un resultado) aparece "Terminar partido con …", que guarda el resultado, avanza y borra los games. "Cargar resultado" y "W.O." siguen igual.
- [ ] El set en curso se ve con borde ámbar y un punto "en vivo" en el club, el modo TV y la página pública (que se recarga sola), y en la app se actualiza por Realtime.
- [ ] RLS: nadie lee `championship_live_games`; solo staff del club carga games (`forbidden` para otro club y para socios); `anon` sigue ejecutando solo `public_championship`.
- [ ] pgTAP, Vitest, lint, typecheck, build y todos los flujos e2e en verde en CI.

## Plan revisions

(append-only)

- **v1 (2026-10-07)**: initial plan.
- **v2 (2026-10-07)**: plan completo en 4 cortes (Tasks 1–12) sobre el diseño aprobado. Decisiones propias en "Decisiones que este plan toma" (set en curso desde el primer game y en 0-0 al cerrar un set, lado como `text` sin enum, nadie lee los games, "Terminar partido" por `recordResult`, "Deshacer" también sobre un partido definido, pestañas por estado, `?partido=` siempre en Fixture, filtro de categoría con `?categoria=`, situaciones extra de la ficha). Migraciones `20261008000100`–`…110`; el pgTAP no usa horas. Validado antes de ejecutar: con el plan entero aplicado sobre la rama, cada bloque "replace" coincide una sola vez en orden; `db reset`, pgTAP completo en verde (65 archivos, 1120 aserciones, `championship_live.test.sql` 30/30), tipos generados, typecheck y lint sin errores, Vitest completo en verde (170 archivos, 901 tests) y los dos flujos e2e de campeonatos en verde. Después se volvió el árbol a `81fc74f`.
- **v3 (2026-10-07)**: ejecutado; "+1" en letra chica, y arreglos de la revisión (ocultar "+1" con el partido definido, confirmar el fin con límite de tiempo, precargar solo sets cerrados).
