---
feature: marca-del-club
type: plan
status: in-progress
date: 2026-10-13
branch: feat/marca-del-club
references: ./design.md
---

# Marca del club Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/team-setup:execute` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el admin elija en Ajustes el color principal, el color de fondo y el modo (según el dispositivo, siempre oscuro o siempre claro), y que la app, el ícono, el manifest, la vista previa al compartir un link, los mails de avisos y el modo TV tomen esa marca; de paso, el lugar que falta en la cancha de un partido abierto pasa a ser un "hueco oscuro".

**Architecture:** `clubs` guarda `brand_primary`, `brand_background` y `color_mode`; solo se escriben por `save_club_brand` (`security definer`, admin del club). Una función pura, `clubTheme` (`lib/domain/club-theme.ts`), arma los doce tokens de cada modo moviendo la paleta de Rustic a los colores del club en OKLCH (`lib/design/oklch.ts`) y corrige el contraste a 4.5:1; con los valores por defecto devuelve exactamente la paleta de `app/globals.css`. El layout raíz escribe esos tokens en un `<style>` desde el servidor (`themeCss`), así que ningún componente cambia salvo el lugar que falta, el logo de reemplazo y el modo TV. El ícono, el manifest y las vistas previas salen de `ImageResponse` y de `generateMetadata`; WhatsApp lee el partido abierto por una RPC nueva para `anon` (`match_preview`), sin nombres.

**Tech Stack:** Next.js 16.3 (App Router, Server Actions, `next/og`, metadata files), React 19, TypeScript, Tailwind 4, Supabase (Postgres 17), Vitest + Testing Library, pgTAP, Playwright.

---

## Antes de empezar

- Rama: `feat/marca-del-club` (sale de `main`; el diseño aprobado está en `bce560f`). Commits chicos; cada corte termina en verde. Se ejecuta de corrido, sin pedir confirmación entre cortes.
- **La implementación de este plan ya se escribió y se validó una vez** (ver "Plan revisions", v2) y quedó guardada en `git stash list` como `marca-del-club: plan validation …`. No hace falta usarla: el plan tiene todo el código. Si se quiere comparar, `git stash show -p stash@{0}`; al terminar la ejecución, `git stash drop` de esa entrada (lo hace la Task 18).
- Docker Desktop corriendo. El CLI de Supabase es devDependency: `npx supabase …` o los scripts de npm (`npm run test:db`, `npm run db:reset`, `npm run db:types`). `gh` no está instalado: el PR se abre y se marca listo desde GitHub.
- Windows: **los archivos con barras invertidas (`\ir` en los tests pgTAP, las regex de algunos tests) se escriben con la herramienta Write**, nunca con heredoc ni `sed`. Las rutas con paréntesis o corchetes (`app/(club)/…`, `[id]`, `[code]`) van entre comillas en bash. El código de la app de este plan no usa barras invertidas.
- Next 16: antes de tocar íconos y vistas previas, leer `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.md`, `…/manifest.md`, `…/opengraph-image.md`, `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/image-response.md`, `…/generate-metadata.md` y `…/generate-viewport.md`. Lo que este plan usa de ahí: los archivos de metadata (`icon`, `apple-icon`, `manifest`, `opengraph-image`) son route handlers que se generan por pedido cuando usan una API de request (acá `getClub()` lee cookies); `generateViewport` no convive con `export const viewport`; `opengraph-image` bajo un grupo de rutas (`(jugador)`) lleva un hash en la URL (`node_modules/next/dist/lib/metadata/get-metadata-route.js`, `getMetadataRouteSuffix`), por eso la imagen del partido es un route handler propio.
- Producción: las migraciones llegan con el merge (`migrate.yml`). **Nunca** correr `supabase link`, `db push` ni nada contra producción desde la máquina local. Las migraciones ya aplicadas **no se editan**: `claim_notification_emails` se copia entera en una migración nueva.
- Migraciones nuevas, posteriores a `20261008000110_championship_live_score.sql`: `20261013000100_club_color_mode.sql` (solo el enum, en su propio archivo), `20261013000110_club_brand.sql`, `20261013000120_match_preview.sql`, `20261013000130_notification_emails_brand.sql`. Un arreglo de la revisión final va en `20261013000140_*.sql`.
- Escrituras solo por RPC `security definer` con `set search_path = ''` y errores con `private.fail(code)`. Supabase da `EXECUTE` a `anon` en cada función nueva de `public`: cada RPC nueva hace su `revoke` y su `grant` (lo controla `integrity.test.sql`).
- Docs en español; identificadores, comentarios de SQL y de código en inglés. Textos de la app en castellano rioplatense.
- pgTAP: un test se corre con `npx supabase test db supabase/tests/database/<archivo>.test.sql`; todos con `npm run test:db`. Los tests nuevos incluyen `\ir helpers/slot.psql`, `\ir helpers/club.psql`, `\ir helpers/match.psql` y, para Eva (admin del club B), `\ir helpers/day_use.psql`.
- Datos del fixture pgTAP (club T `a0000000-0000-0000-0000-000000000001`, club B `…000002`): Ana `…a1`, Bruno `…b1`, Gabi `…a2`, Hugo `…a3` (jugadores), Carla `…c1` (recepción), Dani `…d1` (admin), Eva `…e1` (admin del club B). Canchas `c0000000-0000-0000-0000-000000000001` y `…002`. En este documento `…a1` abrevia `00000000-0000-0000-0000-0000000000a1`; **en los archivos va siempre el uuid completo**.
- **Horas en pgTAP: solo horas de la grilla** (08:00, 09:30, 11:00, 12:30, 14:00, 15:30, 17:00, 18:30, 20:00, 21:30). Nunca 19:00.
- Cada migración nueva se aplica con `npm run db:reset` y después `npm run db:types` regenera `lib/supabase/database.types.ts`, que CI compara byte a byte: se commitea en la misma tarea.
- e2e en local: `npx playwright test --workers=1`. En la validación del plan, las corridas en paralelo contra `next dev` fallaron en specs distintos cada vez (campeonatos, day use, reserva) y en serie pasaron todos: es carga del servidor de desarrollo, no este cambio. CI corre `build` + `start` con un reintento.

## Decisiones que este plan toma (y que el diseño no fijaba)

| Tema | Decisión | Por qué |
| --- | --- | --- |
| Firma de la RPC | `save_club_brand(p_club_id uuid, p_primary text, p_background text, p_mode club_color_mode)` | El diseño la escribió sin club; sin `p_club_id` no hay forma de probar "otro club no" ni de ser explícito como el resto de las RPCs (`create_championship(p_club_id, …)`) |
| Orden de los errores | Primero `forbidden`, después `invalid_color`, después `invalid_input` (modo nulo) | Quien no es admin no aprende nada de los colores |
| Update directo | El `grant update on clubs` y la política `clubs_update_admin` siguen; el check `^#[0-9A-F]{6}$` hace que un update directo tampoco guarde un color inválido. La app escribe solo por la RPC | No se puede quitar una columna de un `grant` de tabla; el check alcanza |
| Lectura pública | No se toca `public_championship`: `clubs` ya es legible por `anon` (`clubs_select_all`) y el layout raíz lo lee con `getClub()` | Las tres columnas nuevas son lo único que se suma, como pide el diseño |
| Cálculo | En OKLCH. Cada token es el de Rustic movido al color del club: misma lightness (absoluta para textos y para todo el modo claro, relativa para `surface`/`border` del oscuro), chroma en proporción, hue girado lo mismo. Después, todo texto se aclara (oscuro) u oscurece (claro) de a 0.01 de L hasta 4.5:1 sobre `bg` y `surface` | Con los colores de Rustic devuelve su paleta exacta (validado byte a byte); para cualquier otro mantiene el carácter |
| Fondo claro en modo oscuro | Con L > 0.30 se baja a 0.30 (mismo hue y chroma) y se avisa. `surface`/`border` suben desde L ≥ 0.15 | Fondo oscuro de verdad; en negro puro las tarjetas se siguen viendo |
| Fondo en modo claro | Blanco para todos (como hoy); el tinte del club va en `surface`, `border` y los textos | Con Rustic `bg` claro es `#FFFFFF` exacto |
| `court-ink` y `danger` | Valores de hoy, corregidos en silencio si no llegan a 4.5:1 sobre el fondo del club | El principio de contraste manda; no son colores que eligió el admin, no se avisan |
| `adjusted` | Solo `bg` (modo oscuro) y `accent-ink` (los dos modos): lo que el admin eligió | El aviso habla de sus colores |
| Aviso | Solo de los modos que el club muestra (`system`: los dos) | Con "Siempre oscuro" no se avisa del modo claro |
| CSS | `:root:root{…}` | Le gana a los `:root` de `globals.css` esté donde esté el `<style>` |
| Barra del navegador | `generateViewport`: `themeColor` y `colorScheme` del modo elegido | El tema del club también arriba |
| Logo de reemplazo | `components/brand/logo.tsx` usa `var(--accent)`/`var(--on-accent)` y las iniciales del club | Sin logo, un club rojo no ve un círculo ámbar con "RP" |
| Ícono | `app/icon.tsx` 512×512 y `app/apple-icon.tsx` 180×180; el manifest apunta a `/icon` y `/apple-icon`. Logo WebP → iniciales (`ImageResponse` no dibuja WebP). Se borra `app/icon.svg` | Un solo dibujo para pestaña, inicio del celular y manifest |
| Fuente de las imágenes | La que trae `ImageResponse` (sin Barlow) | No hay TTF de Barlow en el repo; YAGNI |
| Vista previa del partido | RPC `match_preview(p_match_id)` para `anon`: `starts_at` y `open_sides` mientras está `forming` y por delante; `null` para el resto | WhatsApp no tiene sesión; nunca nombres, cancha, categoría ni precio |
| Imagen del partido | Route handler `GET /api/vista-previa/partido/[id]` | Un `opengraph-image` bajo `(jugador)` tiene un hash en la URL y la página de ingreso necesita apuntarla |
| Partido sin sesión | `/auth/ingreso?next=/partidos/<id>` devuelve la misma metadata del partido | WhatsApp sigue el redirect de `requirePlayer` y lee las etiquetas de la página de ingreso (validado en e2e) |
| Título del partido | La pestaña dice "Faltan 3: 1 de drive y 2 de revés · dom 20:00 · Rustic Pádel" | WhatsApp también lee `<title>`. El anunciador de rutas de Next repite el título: `open-match.spec.ts` busca el texto con `exact: true` |
| Mails | Siempre `clubTheme(...).dark`; el nombre del club sin logo va en `accent-ink` | Diseño ("siempre la versión oscura"); es texto |
| `claim_notification_emails` | `drop` + `create` con `club_brand_primary` y `club_brand_background` al final | Cambiar las columnas de un `returns table` exige recrearla |
| Modo TV | Logo `size-24` a la izquierda del nombre del campeonato | Diseño ("en grande en el encabezado") |
| PR | Push después de la Task 4 y PR borrador desde GitHub; listo al final | Igual que las fases anteriores |

## Mapa de archivos

| Archivo | Responsabilidad |
| --- | --- |
| `supabase/migrations/20261013000100_club_color_mode.sql` | Enum `club_color_mode` |
| `supabase/migrations/20261013000110_club_brand.sql` | Columnas de marca en `clubs`; `save_club_brand` |
| `supabase/migrations/20261013000120_match_preview.sql` | `match_preview` para `anon` |
| `supabase/migrations/20261013000130_notification_emails_brand.sql` | `claim_notification_emails` con los colores del club |
| `supabase/tests/database/club_brand.test.sql`, `match_preview.test.sql` | pgTAP nuevos |
| `supabase/tests/database/integrity.test.sql`, `notification_outbox.test.sql` | pgTAP existentes, ajustados |
| `lib/design/oklch.ts` | hex ↔ OKLCH |
| `lib/domain/club-theme.ts` | `clubTheme`, `themeCss`, `RUSTIC` |
| `lib/domain/club-brand.ts` | Defaults, modos, formulario, aviso, iniciales, viewport, manifest |
| `lib/domain/share-preview.ts` | Textos de las vistas previas |
| `lib/data/share-preview.ts` | Lee `match_preview` y arma la metadata del partido |
| `lib/brand/logo-data-url.ts`, `lib/brand/load-brand.ts`, `lib/brand/brand-images.tsx` | Logo como data URL, marca cargada, `ImageResponse` del ícono y de la vista previa |
| `app/layout.tsx` | `<style>` del tema, `generateMetadata`, `generateViewport` |
| `app/icon.tsx`, `app/apple-icon.tsx`, `app/manifest.ts`, `app/opengraph-image.tsx` | Ícono, manifest y vista previa del club |
| `app/c/[code]/page.tsx`, `app/c/[code]/opengraph-image.tsx` | Vista previa del campeonato |
| `app/(jugador)/partidos/[id]/page.tsx`, `app/auth/ingreso/page.tsx`, `app/api/vista-previa/partido/[id]/route.tsx` | Vista previa del partido |
| `components/club/brand-form.tsx`, `app/(club)/club/ajustes/page.tsx`, `app/(club)/club/ajustes/actions.ts` | Ajustes → "Marca del club" |
| `components/brand/logo.tsx`, `components/brand/club-logo.tsx` | Logo de reemplazo con los tokens |
| `components/matches/match-court.tsx` | El lugar que falta |
| `lib/notify/messages.ts`, `lib/notify/outbox.ts` | Mails con la marca |
| `app/c/[code]/tv/tv-board.tsx`, `app/c/[code]/tv/page.tsx` | Logo en el modo TV |
| `lib/data/championship-fixture.ts` | `loadPublicChampionship` con `cache` |
| `tests/unit/...`, `tests/e2e/club-brand.spec.ts`, `tests/e2e/open-match.spec.ts` | Vitest y e2e |

## Secuencia por cortes

| Corte | Tasks | Resultado | Cómo se prueba |
| --- | --- | --- | --- |
| 1. Base | 1–4 | Marca guardada por RPC, vista previa de partido para `anon`, outbox con colores | pgTAP |
| 2. Dominio | 5–8 | OKLCH, tema, marca, textos de vista previa | Vitest |
| 3. La app con la marca | 9–14 | Tema en el layout, Ajustes, hueco oscuro, mails, TV | Vitest + typecheck |
| 4. Ícono y vistas previas | 15–16 | Ícono, manifest, previews de club, campeonato y partido | Vitest + typecheck + build |
| 5. e2e y cierre | 17–18 | Flujo completo, PR listo | Playwright |

---

## Corte 1: Base

### Task 1: Punto de partida en verde

**Files:** ninguno.

- [ ] **Step 1: Rama, plan commiteado y stack local**

Run:
```bash
git branch --show-current
git status --short
```
Expected: `feat/marca-del-club`. Si `docs/features/marca-del-club/plan.md` aparece modificado, commitearlo primero:
```bash
git add docs/features/marca-del-club/plan.md
git commit -m "docs: plan club branding"
```

Run:
```bash
git log --oneline -3
npx supabase start
npm run db:reset
```
Expected: el último commit es `docs: plan club branding`, sobre `bce560f docs: design club branding (colors, mode, icon, previews)`; `db reset` aplica las migraciones hasta `20261008000110_championship_live_score.sql` (la base local puede tener aplicadas las de la validación: el reset las saca).

- [ ] **Step 2: Todo en verde antes de tocar nada**

Run:
```bash
npm run test:db
npm test
npm run lint
npm run typecheck
```
Expected: todo PASS (65 archivos pgTAP; 170 archivos de Vitest). Si algo falla, parar y avisar: no se empieza sobre rojo.

---

### Task 2: La marca en la base

**Files:**
- Create: `supabase/tests/database/club_brand.test.sql`
- Create: `supabase/migrations/20261013000100_club_color_mode.sql`
- Create: `supabase/migrations/20261013000110_club_brand.sql`
- Modify: `lib/supabase/database.types.ts` (generado)
- Modify: `lib/domain/errors.ts` (al final de `MESSAGES`)
- Modify: `tests/unit/lib/domain/errors.test.ts` (`DATABASE_CODES`)

- [ ] **Step 1: El test pgTAP** (con la herramienta Write: tiene `\ir`)

Create `supabase/tests/database/club_brand.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
\ir helpers/day_use.psql
select plan(14);

-- Defaults: Rustic's amber and night green, following the device.
select results_eq(
  $$ select brand_primary, brand_background, color_mode::text from public.clubs
      where id = 'a0000000-0000-0000-0000-000000000001' $$,
  $$ values ('#FCB021', '#021716', 'system') $$,
  'a club starts with the amber, the night green and the device''s mode');
select throws_ok(
  $$ update public.clubs set brand_primary = '#fcb021' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'colors are stored in upper case only');
select throws_ok(
  $$ update public.clubs set brand_background = 'night' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'and only as #RRGGBB');
select ok(not has_function_privilege('anon', 'public.save_club_brand(uuid, text, text, public.club_color_mode)', 'execute'),
  'anon cannot save a brand');

set local role authenticated;

-- Dani, admin of club T
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select lives_ok(
  $$ select public.save_club_brand('a0000000-0000-0000-0000-000000000001', ' #e11d48 ', '#1a1a2e', 'dark') $$,
  'the admin saves the brand');
select results_eq(
  $$ select brand_primary, brand_background, color_mode::text from public.clubs
      where id = 'a0000000-0000-0000-0000-000000000001' $$,
  $$ values ('#E11D48', '#1A1A2E', 'dark') $$,
  'trimmed and in upper case');
select throws_ok(
  $$ select public.save_club_brand('a0000000-0000-0000-0000-000000000001', '#FFF', '#021716', 'system') $$,
  'P0001', 'invalid_color', 'a short hex is not a color');
select throws_ok(
  $$ select public.save_club_brand('a0000000-0000-0000-0000-000000000001', 'rojo', '#021716', 'system') $$,
  'P0001', 'invalid_color', 'nor a name');
select throws_ok(
  $$ select public.save_club_brand('a0000000-0000-0000-0000-000000000001', '#FCB021', '#GGGGGG', 'system') $$,
  'P0001', 'invalid_color', 'nor a hex with letters past F');
select throws_ok(
  $$ select public.save_club_brand('a0000000-0000-0000-0000-000000000002', '#FCB021', '#021716', 'system') $$,
  'P0001', 'forbidden', 'not the brand of another club');

-- Carla, reception
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok(
  $$ select public.save_club_brand('a0000000-0000-0000-0000-000000000001', '#FCB021', '#021716', 'system') $$,
  'P0001', 'forbidden', 'reception cannot change the brand');

-- Ana, player
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.save_club_brand('a0000000-0000-0000-0000-000000000001', '#FCB021', '#021716', 'system') $$,
  'P0001', 'forbidden', 'nor a player');

-- Eva, admin of club B
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select throws_ok(
  $$ select public.save_club_brand('a0000000-0000-0000-0000-000000000001', '#FCB021', '#021716', 'system') $$,
  'P0001', 'forbidden', 'nor the admin of another club');

reset role;
select results_eq(
  $$ select brand_primary, brand_background, color_mode::text from public.clubs
      where id = 'a0000000-0000-0000-0000-000000000001' $$,
  $$ values ('#E11D48', '#1A1A2E', 'dark') $$,
  'the club keeps what its admin saved');

select * from finish();
rollback;
```

- [ ] **Step 2: Verlo fallar**

Run: `npx supabase test db supabase/tests/database/club_brand.test.sql`
Expected: FAIL (`column "brand_primary" does not exist`).

- [ ] **Step 3: El enum, solo en su archivo**

Create `supabase/migrations/20261013000100_club_color_mode.sql`:
```sql
-- Marca del club, part 0: how the club shows, following the device, always dark or always light. Alone in its
-- file, like every enum change in this project (see 20261007000100_championship_fixture_kind.sql).
create type public.club_color_mode as enum ('system', 'dark', 'light');
```

- [ ] **Step 4: Las columnas y la RPC**

Create `supabase/migrations/20261013000110_club_brand.sql`:
```sql
-- Marca del club, part 1: the club stores two colors and a mode; the app works out every other color when it
-- shows them (lib/domain/club-theme.ts). With the defaults Rustic looks exactly as before. Colors are #RRGGBB in
-- upper case, so the check and the RPC agree on one spelling.
alter table public.clubs
  add column brand_primary text not null default '#FCB021'
    constraint clubs_brand_primary_hex check (brand_primary ~ '^#[0-9A-F]{6}$'),
  add column brand_background text not null default '#021716'
    constraint clubs_brand_background_hex check (brand_background ~ '^#[0-9A-F]{6}$'),
  add column color_mode public.club_color_mode not null default 'system';

-- Ajustes → "Marca del club". Admins of the club only; a color that is not #RRGGBB (any case) is invalid_color.
create function public.save_club_brand(
  p_club_id uuid,
  p_primary text,
  p_background text,
  p_mode public.club_color_mode
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_primary text := upper(trim(p_primary));
  v_background text := upper(trim(p_background));
begin
  if not private.has_club_role(p_club_id, array['admin']::public.club_role[]) then
    perform private.fail('forbidden');
  end if;
  if v_primary is null or v_primary !~ '^#[0-9A-F]{6}$'
     or v_background is null or v_background !~ '^#[0-9A-F]{6}$' then
    perform private.fail('invalid_color');
  end if;
  if p_mode is null then
    perform private.fail('invalid_input');
  end if;
  update public.clubs
     set brand_primary = v_primary, brand_background = v_background, color_mode = p_mode
   where id = p_club_id;
end;
$$;

revoke execute on function public.save_club_brand(uuid, text, text, public.club_color_mode) from public, anon;
grant execute on function public.save_club_brand(uuid, text, text, public.club_color_mode) to authenticated;
```

- [ ] **Step 5: Aplicar y verlo pasar**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/club_brand.test.sql
```
Expected: `Files=1, Tests=14 … Result: PASS`.

- [ ] **Step 6: Tipos**

Run: `npm run db:types`
Expected: `git diff --stat lib/supabase/database.types.ts` muestra `clubs` con `brand_background`, `brand_primary`, `color_mode`, la función `save_club_brand` y el enum `club_color_mode` (en `Enums` y en `Constants`).

- [ ] **Step 7: El mensaje de `invalid_color`**

In `lib/domain/errors.ts`, replace:
```ts
  invalid_result: 'Ese resultado no es posible con las reglas de la categoría.',
} as const
```
with:
```ts
  invalid_result: 'Ese resultado no es posible con las reglas de la categoría.',
  invalid_color: 'Ese color no es válido. Usá el formato #RRGGBB, por ejemplo #FCB021.',
} as const
```

In `tests/unit/lib/domain/errors.test.ts`, replace:
```ts
  'invalid_result',
]
```
with:
```ts
  'invalid_result',
  'invalid_color',
]
```

Run: `npx vitest run tests/unit/lib/domain/errors.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261013000100_club_color_mode.sql supabase/migrations/20261013000110_club_brand.sql supabase/tests/database/club_brand.test.sql lib/supabase/database.types.ts lib/domain/errors.ts tests/unit/lib/domain/errors.test.ts
git commit -m "feat(marca): club brand colors and mode, saved by the admin through save_club_brand"
```

---

### Task 3: La vista previa del partido en la base

**Files:**
- Create: `supabase/tests/database/match_preview.test.sql`
- Create: `supabase/migrations/20261013000120_match_preview.sql`
- Modify: `supabase/tests/database/integrity.test.sql:7-15`
- Modify: `lib/supabase/database.types.ts` (generado)

- [ ] **Step 1: El test pgTAP** (con la herramienta Write)

Create `supabase/tests/database/match_preview.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/slot.psql
\ir helpers/club.psql
\ir helpers/match.psql
select plan(6);

-- Ana (drive) and Gabi and Hugo in team B: one backhand missing in team A.
call test_helpers.make_match('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(2, '20:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', null, '00000000-0000-0000-0000-0000000000a2',
        '00000000-0000-0000-0000-0000000000a3']::uuid[]);
-- Only Ana: three missing.
call test_helpers.make_match('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  test_helpers.slot(3, '18:30', 90),
  array['00000000-0000-0000-0000-0000000000a1', null, null, null]::uuid[]);
-- Cancelled by the club.
call test_helpers.make_match('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
  test_helpers.slot(4, '20:00', 90),
  array['00000000-0000-0000-0000-0000000000a1', null, null, null]::uuid[]);
update public.open_matches set status = 'cancelled', cancel_reason = 'by_club', cancelled_at = now()
 where id = 'd0000000-0000-0000-0000-000000000003';

-- WhatsApp, without a session
set local role anon;
select is(
  public.match_preview('d0000000-0000-0000-0000-000000000001'),
  jsonb_build_object('starts_at', test_helpers.at(2, '20:00'), 'open_sides', '["backhand"]'::jsonb),
  'anon reads when the match starts and the side that is missing');
select is(
  public.match_preview('d0000000-0000-0000-0000-000000000002') -> 'open_sides',
  '["backhand", "drive", "backhand"]'::jsonb,
  'every free spot, in order');
select ok(
  position('Ana' in public.match_preview('d0000000-0000-0000-0000-000000000001')::text) = 0
    and position('Cancha' in public.match_preview('d0000000-0000-0000-0000-000000000001')::text) = 0,
  'no names and no court');
select is(public.match_preview('d0000000-0000-0000-0000-000000000003'), null, 'nothing for a cancelled match');
select is(public.match_preview('d0000000-0000-0000-0000-0000000000ff'), null, 'nor for one that does not exist');
reset role;

-- Still ahead only: the same match, moved to yesterday.
update public.open_matches set period = test_helpers.slot(-1, '20:00', 90)
 where id = 'd0000000-0000-0000-0000-000000000001';
select is(public.match_preview('d0000000-0000-0000-0000-000000000001'), null, 'nor for one already played');

select * from finish();
rollback;
```

- [ ] **Step 2: Verlo fallar**

Run: `npx supabase test db supabase/tests/database/match_preview.test.sql`
Expected: FAIL (`function public.match_preview(unknown) does not exist`).

- [ ] **Step 3: La RPC**

Create `supabase/migrations/20261013000120_match_preview.sql`:
```sql
-- Marca del club, part 2: the preview WhatsApp shows for a link to an open match ("Falta 1 de revés · jue 20:00").
-- WhatsApp has no session, so anon reads it: only when the match starts and which sides are free, while it is
-- forming and still ahead. Never names, court, category or price. Null for anything else.
create function public.match_preview(p_match_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'starts_at', m.starts_at,
    'open_sides', coalesce((
      select jsonb_agg(s.side order by s.position)
      from public.match_slots s
      where s.match_id = m.id and s.player_id is null), '[]'::jsonb))
  from public.open_matches m
  where m.id = p_match_id and m.status = 'forming' and m.starts_at > now();
$$;

revoke all on function public.match_preview(uuid) from public;
grant execute on function public.match_preview(uuid) to anon, authenticated;
```

- [ ] **Step 4: `anon` ejecuta dos funciones**

In `supabase/tests/database/integrity.test.sql`, replace:
```sql
-- Grants: Supabase gives EXECUTE on new public functions to anon by default. None of ours may keep it but the
-- public page of a championship, and authenticated never runs the private helpers that write or skip the
-- permission checks.
```
with:
```sql
-- Grants: Supabase gives EXECUTE on new public functions to anon by default. None of ours may keep it but the
-- public page of a championship and the preview of an open match, and authenticated never runs the private helpers
-- that write or skip the permission checks.
```
and replace:
```sql
  array['public.public_championship'],
  'anon executes only public_championship (the read-only public page of a championship)');
```
with:
```sql
  array['public.match_preview', 'public.public_championship'],
  'anon executes only public_championship and match_preview (read-only, for links shared without a session)');
```

- [ ] **Step 5: Aplicar y verlo pasar**

Run:
```bash
npm run db:reset
npx supabase test db supabase/tests/database/match_preview.test.sql supabase/tests/database/integrity.test.sql
```
Expected: `Files=2, Tests=27 … Result: PASS` (el `WARNING: extend_all_series … division_by_zero` de `integrity` ya estaba).

- [ ] **Step 6: Tipos y commit**

Run: `npm run db:types` (suma `match_preview: { Args: { p_match_id: string }; Returns: Json }`).

```bash
git add supabase/migrations/20261013000120_match_preview.sql supabase/tests/database/match_preview.test.sql supabase/tests/database/integrity.test.sql lib/supabase/database.types.ts
git commit -m "feat(marca): match_preview, what a shared open match link shows without a session"
```

---

### Task 4: Los avisos traen los colores del club

**Files:**
- Create: `supabase/migrations/20261013000130_notification_emails_brand.sql`
- Modify: `supabase/tests/database/notification_outbox.test.sql:32-40`
- Modify: `lib/supabase/database.types.ts` (generado)

- [ ] **Step 1: El test pide los colores**

In `supabase/tests/database/notification_outbox.test.sql`, replace:
```sql
  $$ select notification_id, kind::text, email, player_name, club_name, club_timezone, link
     from public.claim_notification_emails(10) $$,
  $$ values ('e2000000-0000-0000-0000-000000000001'::uuid, 'slot_held', 'ana@test.local', 'Ana', 'Club T',
             'America/Montevideo', '/'),
            ('e2000000-0000-0000-0000-000000000002'::uuid, 'slot_free_now', 'bruno@test.local', 'Bruno', 'Club T',
             'America/Montevideo', '/reservar') $$,
  'the service role takes the pending avisos, oldest first, with each player''s email');
```
with:
```sql
  $$ select notification_id, kind::text, email, player_name, club_name, club_timezone, link, club_brand_primary,
            club_brand_background
     from public.claim_notification_emails(10) $$,
  $$ values ('e2000000-0000-0000-0000-000000000001'::uuid, 'slot_held', 'ana@test.local', 'Ana', 'Club T',
             'America/Montevideo', '/', '#FCB021', '#021716'),
            ('e2000000-0000-0000-0000-000000000002'::uuid, 'slot_free_now', 'bruno@test.local', 'Bruno', 'Club T',
             'America/Montevideo', '/reservar', '#FCB021', '#021716') $$,
  'the service role takes the pending avisos, oldest first, with each player''s email and the club''s colors');
```

Run: `npx supabase test db supabase/tests/database/notification_outbox.test.sql`
Expected: FAIL (`column "club_brand_primary" does not exist`).

- [ ] **Step 2: La función, copiada entera con dos columnas más**

Create `supabase/migrations/20261013000130_notification_emails_brand.sql`:
```sql
-- Marca del club, part 3: the avisos mails take the club's colors. claim_notification_emails also returns the
-- club's two brand colors; a new column in its result needs drop and create. The body is the one of
-- 20261005000160_waitlist_review_fixes.sql, with cl.brand_primary and cl.brand_background at the end.
drop function public.claim_notification_emails(integer);

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
  club_logo_path text,
  club_brand_primary text,
  club_brand_background text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The mail of a hold that is no longer active would offer a slot that is gone.
  update public.notifications n
     set email_status = 'skipped', email_locked_until = null
   where n.kind = 'slot_held' and n.email_status in ('pending', 'failed')
     and not exists (
       select 1 from public.slot_holds h where h.id = (n.data ->> 'hold_id')::uuid and h.status = 'active'
     );

  return query
  with picked as (
    select n.id
    from public.notifications n
    where n.email_status in ('pending', 'failed') and n.email_attempts < 3
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
  select c.id, c.kind, c.data, c.link, u.email::text, p.display_name, cl.name, cl.timezone, cl.logo_path,
         cl.brand_primary, cl.brand_background
  from claimed c
  join auth.users u on u.id = c.user_id
  join public.profiles p on p.id = c.user_id
  join public.clubs cl on cl.id = c.club_id
  order by c.created_at;
end;
$$;

revoke execute on function public.claim_notification_emails(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_emails(integer) to service_role;
```

- [ ] **Step 3: Todo pgTAP**

Run:
```bash
npm run db:reset
npm run test:db
```
Expected: `Files=67, Tests=1140 … Result: PASS`.

- [ ] **Step 4: Tipos, typecheck y commit**

Run:
```bash
npm run db:types
npm run typecheck
```
Expected: los tipos suman `club_brand_background` y `club_brand_primary` a `claim_notification_emails`; typecheck sin errores (`lib/notify/outbox.ts` todavía no los lee).

```bash
git add supabase/migrations/20261013000130_notification_emails_brand.sql supabase/tests/database/notification_outbox.test.sql lib/supabase/database.types.ts
git commit -m "feat(marca): the outbox returns the club's brand colors"
git push -u origin feat/marca-del-club
```
Abrir el PR borrador desde GitHub ("Marca del club").

---

## Corte 2: Dominio

### Task 5: OKLCH

**Files:**
- Create: `lib/design/oklch.ts`
- Test: `tests/unit/lib/design/oklch.test.ts`

- [ ] **Step 1: El test**

Create `tests/unit/lib/design/oklch.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { hexToOklch, oklchToHex } from '@/lib/design/oklch'

describe('OKLCH', () => {
  it('puts black at 0 and white at 1 of lightness, both without chroma', () => {
    expect(hexToOklch('#000000').l).toBeCloseTo(0, 6)
    expect(hexToOklch('#FFFFFF').l).toBeCloseTo(1, 6)
    expect(hexToOklch('#FFFFFF').c).toBeCloseTo(0, 6)
  })

  it('gives back every 8-bit color it was given', () => {
    for (let r = 0; r < 256; r += 15) {
      for (let g = 0; g < 256; g += 15) {
        for (let b = 0; b < 256; b += 15) {
          const hex = `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`
          expect(oklchToHex(hexToOklch(hex))).toBe(hex)
        }
      }
    }
  })

  it('clips what falls outside the screen colors instead of breaking', () => {
    expect(oklchToHex({ l: 1.2, c: 0, h: 0 })).toBe('#FFFFFF')
    expect(oklchToHex({ l: 0.7, c: 0.4, h: 30 })).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('accepts lower case and rejects what is not #RRGGBB', () => {
    expect(oklchToHex(hexToOklch('#fcb021'))).toBe('#FCB021')
    expect(() => hexToOklch('#FFF')).toThrow(/RRGGBB/)
    expect(() => hexToOklch('rojo')).toThrow(/RRGGBB/)
  })
})
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run tests/unit/lib/design/oklch.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/design/oklch"`).

- [ ] **Step 3: La conversión**

Create `lib/design/oklch.ts`:
```ts
// OKLCH (Björn Ottosson's OKLab in polar form): lightness 0..1 that tracks what the eye sees, chroma, hue in degrees.
// Steps in L look the same on any hue, which is what "a bit lighter" needs.
export type Oklch = { l: number; c: number; h: number }

const HEX6 = /^#([0-9a-f]{6})$/i

function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function toGamma(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055
}

export function hexToOklch(hex: string): Oklch {
  const match = HEX6.exec(hex)
  if (!match) throw new Error(`Not a #RRGGBB color: ${hex}`)
  const [r, g, b] = [0, 2, 4].map((start) => toLinear(parseInt(match[1].slice(start, start + 2), 16) / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { l: L, c: Math.hypot(A, B), h: (Math.atan2(B, A) * 180) / Math.PI }
}

// Out of the sRGB gamut, each channel is clipped: the color stays close, the hue may move a little.
export function oklchToHex({ l: L, c, h }: Oklch): string {
  const A = c * Math.cos((h * Math.PI) / 180)
  const B = c * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return `#${rgb
    .map((channel) => Math.round(toGamma(Math.min(1, Math.max(0, channel))) * 255))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`
}
```

- [ ] **Step 4: Verlo pasar**

Run: `npx vitest run tests/unit/lib/design/oklch.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/design/oklch.ts tests/unit/lib/design/oklch.test.ts
git commit -m "feat(marca): hex and OKLCH conversion"
```

---

### Task 6: El tema del club

**Files:**
- Create: `lib/domain/club-theme.ts`
- Test: `tests/unit/lib/domain/club-theme.test.ts`

- [ ] **Step 1: El test** (con la herramienta Write: tiene regex con barras)

Create `tests/unit/lib/domain/club-theme.test.ts`:
```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/design/contrast'
import { clubTheme, RUSTIC, THEME_TOKENS, themeCss, type Tokens } from '@/lib/domain/club-theme'

// The fallback palette in app/globals.css: the dark :root and the light one inside the media query.
function globalsPalette(): { dark: Record<string, string>; light: Record<string, string> } {
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')
  const [dark, light] = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map((match) =>
    Object.fromEntries([...match[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2].toUpperCase()])),
  )
  return { dark, light }
}

const READABLE: Array<[keyof Tokens, keyof Tokens]> = [
  ['fg', 'bg'], ['fg', 'surface'], ['fg-muted', 'bg'], ['fg-muted', 'surface'],
  ['accent-ink', 'bg'], ['accent-ink', 'surface'], ['court-ink', 'bg'], ['court-ink', 'surface'],
  ['danger', 'bg'], ['danger', 'surface'], ['on-accent', 'accent'], ['on-court', 'court'],
]
const PRIMARIES = { amber: '#FCB021', yellow: '#FFE600', white: '#FFFFFF', black: '#000000', blue: '#1D4ED8' }
const BACKGROUNDS = { dark: '#021716', light: '#F5F0E6', medium: '#3A6B5A', black: '#000000', red: '#B91C1C' }

describe('clubTheme', () => {
  it("gives Rustic's colors exactly today's palette of globals.css", () => {
    const theme = clubTheme({ primary: '#FCB021', background: '#021716' })
    expect(theme.dark).toEqual(RUSTIC.dark)
    expect(theme.light).toEqual(RUSTIC.light)
    expect(globalsPalette()).toEqual({ dark: RUSTIC.dark, light: RUSTIC.light })
  })

  for (const [primaryName, primary] of Object.entries(PRIMARIES)) {
    for (const [backgroundName, background] of Object.entries(BACKGROUNDS)) {
      it(`keeps every text at 4.5:1 with a ${primaryName} primary on a ${backgroundName} background`, () => {
        const theme = clubTheme({ primary, background })
        for (const mode of ['dark', 'light'] as const) {
          for (const [fg, bg] of READABLE) {
            const ratio = contrastRatio(theme[mode][fg], theme[mode][bg])
            expect(ratio, `${mode}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
          }
        }
      })
    }
  }

  it('uses the primary as is for buttons, with black or white on it, whichever reads better', () => {
    const theme = clubTheme({ primary: '#1D4ED8', background: '#021716' })
    expect(theme.dark.accent).toBe('#1D4ED8')
    expect(theme.light.accent).toBe('#1D4ED8')
    expect(theme.dark['on-accent']).toBe('#FFFFFF')
    expect(clubTheme({ primary: '#FFE600', background: '#021716' }).dark['on-accent']).toBe('#000000')
  })

  it('reports only what it corrected: the amber as text on light, for Rustic', () => {
    expect(clubTheme({ primary: '#FCB021', background: '#021716' }).adjusted).toEqual([{ mode: 'light', token: 'accent-ink' }])
    expect(clubTheme({ primary: '#1D4ED8', background: '#021716' }).adjusted).toEqual([{ mode: 'dark', token: 'accent-ink' }])
  })

  it('darkens a light background for dark mode and says so', () => {
    const theme = clubTheme({ primary: '#FCB021', background: '#F5F0E6' })
    expect(theme.adjusted).toContainEqual({ mode: 'dark', token: 'bg' })
    expect(contrastRatio('#FFFFFF', theme.dark.bg)).toBeGreaterThan(10)
  })

  it('keeps cards visible on a black background', () => {
    const theme = clubTheme({ primary: '#FCB021', background: '#000000' })
    expect(theme.dark.bg).toBe('#000000')
    expect(theme.dark.surface).not.toBe('#000000')
    expect(contrastRatio(theme.dark.surface, theme.dark.bg)).toBeGreaterThan(1.15)
  })

  it('takes lower case and falls back to Rustic for what is not a color', () => {
    expect(clubTheme({ primary: '#fcb021', background: '#021716' }).dark.accent).toBe('#FCB021')
    const fallback = clubTheme({ primary: 'rojo', background: '#GGGGGG' })
    expect(fallback.dark).toEqual(RUSTIC.dark)
    expect(fallback.light).toEqual(RUSTIC.light)
  })
})

describe('themeCss', () => {
  const theme = clubTheme({ primary: '#E11D48', background: '#021716' })

  it('follows the device: dark by default, light inside the media query', () => {
    const css = themeCss(theme, 'system')
    expect(css.startsWith(':root:root{color-scheme:dark;--bg:#021716;')).toBe(true)
    expect(css).toContain('@media (prefers-color-scheme: light){:root:root{color-scheme:light;--bg:#FFFFFF;')
    expect(css).toContain('--accent:#E11D48;')
    for (const token of THEME_TOKENS) expect(css).toContain(`--${token}:`)
  })

  it('writes only the mode the club chose', () => {
    expect(themeCss(theme, 'dark')).toBe(`:root:root{color-scheme:dark;${THEME_TOKENS.map((t) => `--${t}:${theme.dark[t]};`).join('')}}`)
    expect(themeCss(theme, 'light')).toBe(`:root:root{color-scheme:light;${THEME_TOKENS.map((t) => `--${t}:${theme.light[t]};`).join('')}}`)
    expect(themeCss(theme, 'light')).not.toContain('@media')
  })
})
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run tests/unit/lib/domain/club-theme.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/domain/club-theme"`).

- [ ] **Step 3: El cálculo**

Create `lib/domain/club-theme.ts`:
```ts
import { contrastRatio } from '@/lib/design/contrast'
import { hexToOklch, oklchToHex, type Oklch } from '@/lib/design/oklch'

export const THEME_TOKENS = [
  'bg', 'surface', 'border', 'fg', 'fg-muted', 'accent', 'on-accent', 'accent-ink', 'court', 'on-court', 'court-ink', 'danger',
] as const
export type ThemeToken = (typeof THEME_TOKENS)[number]
export type Tokens = Record<ThemeToken, string>
export type ThemeMode = 'dark' | 'light'
export type ColorMode = 'system' | ThemeMode
// What the calculation changed from what the admin picked: shown as a notice in Ajustes.
export type Adjustment = { mode: 'dark'; token: 'bg' | 'accent-ink' } | { mode: 'light'; token: 'accent-ink' }
export type ClubTheme = { dark: Tokens; light: Tokens; adjusted: Adjustment[] }
export type BrandColors = { primary: string; background: string }

export const DEFAULT_PRIMARY = '#FCB021'
export const DEFAULT_BACKGROUND = '#021716'
export const MIN_CONTRAST = 4.5

// Rustic's palette (the one app/globals.css keeps as a fallback). Every other club's palette is this one moved to
// its colors: the same lightness steps, its hue, its chroma in proportion.
export const RUSTIC: { dark: Tokens; light: Tokens } = {
  dark: {
    bg: '#021716', surface: '#0A2624', border: '#1E3A38', fg: '#FFFFFF', 'fg-muted': '#B8C4C3',
    accent: '#FCB021', 'on-accent': '#000000', 'accent-ink': '#FCB021',
    court: '#025995', 'on-court': '#FFFFFF', 'court-ink': '#4DA3DB', danger: '#FF8A7A',
  },
  light: {
    bg: '#FFFFFF', surface: '#F1F4F4', border: '#D5DCDB', fg: '#021716', 'fg-muted': '#4A5857',
    accent: '#FCB021', 'on-accent': '#000000', 'accent-ink': '#8A5A00',
    court: '#025995', 'on-court': '#FFFFFF', 'court-ink': '#025995', danger: '#B42318',
  },
}

const HEX6 = /^#[0-9a-f]{6}$/i
// A background lighter than this (OKLCH lightness) is darkened for dark mode: surfaces and borders go lighter still.
const DARK_BG_MAX_L = 0.3
// Surfaces step up from at least this lightness, so cards still show on a black background.
const DARK_STEP_FROM_L = 0.15

const lch = hexToOklch
const DEFAULT_BG = lch(DEFAULT_BACKGROUND)
const DEFAULT_ACCENT = lch(DEFAULT_PRIMARY)

// The step from Rustic's background (or accent) to one of its tokens, applied to another color: lightness either
// moved by the same amount (relative) or set to the token's (absolute), chroma in proportion, hue turned the same.
// With Rustic's own color it gives back the token exactly.
function derive(base: Oklch, from: Oklch, to: Oklch, lightness: 'relative' | 'absolute'): string {
  const l = lightness === 'relative' ? base.l + (to.l - from.l) : to.l
  return oklchToHex({
    l: Math.min(1, Math.max(0, l)),
    c: from.c > 0 ? base.c * (to.c / from.c) : to.c,
    h: base.h + (to.h - from.h),
  })
}

const readable = (color: string, backgrounds: string[]) =>
  backgrounds.every((background) => contrastRatio(color, background) >= MIN_CONTRAST)

// The color as is when it reads on every background; otherwise lighter (dark mode) or darker (light mode) in
// small steps until it does. White or black when nothing in between reads.
function ensureReadable(color: string, backgrounds: string[], direction: 'lighter' | 'darker'): string {
  if (readable(color, backgrounds)) return color
  const start = lch(color)
  const sign = direction === 'lighter' ? 1 : -1
  for (let step = 1; step <= 100; step++) {
    const candidate = oklchToHex({ ...start, l: Math.min(1, Math.max(0, start.l + sign * step * 0.01)) })
    if (readable(candidate, backgrounds)) return candidate
  }
  return direction === 'lighter' ? '#FFFFFF' : '#000000'
}

function onColor(color: string): string {
  return contrastRatio('#000000', color) >= contrastRatio('#FFFFFF', color) ? '#000000' : '#FFFFFF'
}

function darkTokens(primary: string, background: string): { tokens: Tokens; adjusted: Adjustment[] } {
  const adjusted: Adjustment[] = []
  const given = lch(background)
  const darkened = given.l > DARK_BG_MAX_L
  const base = darkened ? { ...given, l: DARK_BG_MAX_L } : given
  const bg = darkened ? oklchToHex(base) : background
  if (darkened) adjusted.push({ mode: 'dark', token: 'bg' })
  const D = RUSTIC.dark
  const stepFrom = { ...base, l: Math.max(base.l, DARK_STEP_FROM_L) }
  const surface = derive(stepFrom, DEFAULT_BG, lch(D.surface), 'relative')
  const border = derive(stepFrom, DEFAULT_BG, lch(D.border), 'relative')
  const on = [bg, surface]
  const accentInk = ensureReadable(primary, on, 'lighter')
  if (accentInk !== primary) adjusted.push({ mode: 'dark', token: 'accent-ink' })
  return {
    adjusted,
    tokens: {
      bg,
      surface,
      border,
      fg: ensureReadable(derive(base, DEFAULT_BG, lch(D.fg), 'absolute'), on, 'lighter'),
      'fg-muted': ensureReadable(derive(base, DEFAULT_BG, lch(D['fg-muted']), 'absolute'), on, 'lighter'),
      accent: primary,
      'on-accent': onColor(primary),
      'accent-ink': accentInk,
      court: D.court,
      'on-court': D['on-court'],
      'court-ink': ensureReadable(D['court-ink'], on, 'lighter'),
      danger: ensureReadable(D.danger, on, 'lighter'),
    },
  }
}

function lightTokens(primary: string, background: string): { tokens: Tokens; adjusted: Adjustment[] } {
  const adjusted: Adjustment[] = []
  const base = lch(background)
  const L = RUSTIC.light
  const bg = derive(base, DEFAULT_BG, lch(L.bg), 'absolute')
  const surface = derive(base, DEFAULT_BG, lch(L.surface), 'absolute')
  const on = [bg, surface]
  let accentInk = primary
  if (!readable(primary, on)) {
    // Toward Rustic's amber-ink: its lightness (or the primary's, if already darker), the primary's hue.
    const given = lch(primary)
    const anchor = lch(L['accent-ink'])
    const toward = derive(given, DEFAULT_ACCENT, { ...anchor, l: Math.min(given.l, anchor.l) }, 'absolute')
    accentInk = ensureReadable(toward, on, 'darker')
    adjusted.push({ mode: 'light', token: 'accent-ink' })
  }
  return {
    adjusted,
    tokens: {
      bg,
      surface,
      border: derive(base, DEFAULT_BG, lch(L.border), 'absolute'),
      fg: ensureReadable(derive(base, DEFAULT_BG, lch(L.fg), 'absolute'), on, 'darker'),
      'fg-muted': ensureReadable(derive(base, DEFAULT_BG, lch(L['fg-muted']), 'absolute'), on, 'darker'),
      accent: primary,
      'on-accent': onColor(primary),
      'accent-ink': accentInk,
      court: L.court,
      'on-court': L['on-court'],
      'court-ink': ensureReadable(L['court-ink'], on, 'darker'),
      danger: ensureReadable(L.danger, on, 'darker'),
    },
  }
}

// The club's whole palette, worked out from its two colors. A value that is not #RRGGBB falls back to Rustic's.
export function clubTheme({ primary, background }: BrandColors): ClubTheme {
  const p = HEX6.test(primary) ? primary.toUpperCase() : DEFAULT_PRIMARY
  const b = HEX6.test(background) ? background.toUpperCase() : DEFAULT_BACKGROUND
  const dark = darkTokens(p, b)
  const light = lightTokens(p, b)
  return { dark: dark.tokens, light: light.tokens, adjusted: [...dark.adjusted, ...light.adjusted] }
}

function block(tokens: Tokens, mode: ThemeMode): string {
  const vars = THEME_TOKENS.map((token) => `--${token}:${tokens[token]};`).join('')
  // :root:root outranks the fallback :root blocks of globals.css, wherever this style lands in the page.
  return `:root:root{color-scheme:${mode};${vars}}`
}

// The <style> the root layout writes: both modes following the device, or only the one the club chose.
export function themeCss(theme: ClubTheme, mode: ColorMode): string {
  if (mode === 'dark') return block(theme.dark, 'dark')
  if (mode === 'light') return block(theme.light, 'light')
  return `${block(theme.dark, 'dark')}@media (prefers-color-scheme: light){${block(theme.light, 'light')}}`
}
```

- [ ] **Step 4: Verlo pasar**

Run: `npx vitest run tests/unit/lib/domain/club-theme.test.ts tests/unit/app/design-tokens.test.ts`
Expected: PASS (33 tests en `club-theme`: 25 combinaciones + 8; `design-tokens` sin cambios).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/club-theme.ts tests/unit/lib/domain/club-theme.test.ts
git commit -m "feat(marca): clubTheme works out every token from two colors, at 4.5:1"
```

---

### Task 7: La marca del club (formulario, aviso, viewport, manifest)

**Files:**
- Create: `lib/domain/club-brand.ts`
- Test: `tests/unit/lib/domain/club-brand.test.ts`

- [ ] **Step 1: El test**

Create `tests/unit/lib/domain/club-brand.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  adjustmentNotice,
  brandOf,
  brandViewport,
  clubInitials,
  DEFAULT_BRAND,
  normalizeHex,
  parseBrandForm,
  webManifest,
} from '@/lib/domain/club-brand'

function form(values: Record<string, string>): FormData {
  const data = new FormData()
  for (const [name, value] of Object.entries(values)) data.set(name, value)
  return data
}

describe('normalizeHex', () => {
  it('takes #RRGGBB in any case, with or without # and spaces, in upper case', () => {
    expect(normalizeHex('#fcb021')).toBe('#FCB021')
    expect(normalizeHex(' e11d48 ')).toBe('#E11D48')
  })

  it('rejects short hex, names and letters past F', () => {
    expect(normalizeHex('#FFF')).toBeNull()
    expect(normalizeHex('rojo')).toBeNull()
    expect(normalizeHex('#GGGGGG')).toBeNull()
  })
})

describe('brandOf', () => {
  it('reads the club row', () => {
    expect(brandOf({ brand_primary: '#E11D48', brand_background: '#1A1A2E', color_mode: 'dark' })).toEqual({
      primary: '#E11D48',
      background: '#1A1A2E',
      mode: 'dark',
    })
  })
})

describe('parseBrandForm', () => {
  it('reads both colors and the mode', () => {
    expect(parseBrandForm(form({ primary: '#e11d48', background: '1a1a2e', mode: 'light' }))).toEqual({
      ok: true,
      value: { primary: '#E11D48', background: '#1A1A2E', mode: 'light' },
    })
  })

  it('says which color is wrong', () => {
    expect(parseBrandForm(form({ primary: '#FFF', background: '#021716', mode: 'system' }))).toEqual({
      ok: false,
      message: 'Revisá el color principal: tiene que ser #RRGGBB, por ejemplo #FCB021.',
    })
    expect(parseBrandForm(form({ primary: '#FCB021', background: 'verde', mode: 'system' }))).toEqual({
      ok: false,
      message: 'Revisá el color de fondo: tiene que ser #RRGGBB, por ejemplo #021716.',
    })
    expect(parseBrandForm(form({ primary: '#FCB021', background: '#021716', mode: 'sepia' }))).toEqual({
      ok: false,
      message: 'Elegí cómo se ve la app.',
    })
  })
})

describe('adjustmentNotice', () => {
  const amberOnLight = [{ mode: 'light', token: 'accent-ink' }] as const

  it('explains what changed in the modes the club shows', () => {
    expect(adjustmentNotice([...amberOnLight], 'system')).toBe(
      'Tu color principal, como texto sobre fondo claro, se oscurece un poco para que se lea.',
    )
    expect(adjustmentNotice([...amberOnLight], 'light')).not.toBeNull()
  })

  it('says nothing about a mode the club never shows, or when nothing changed', () => {
    expect(adjustmentNotice([...amberOnLight], 'dark')).toBeNull()
    expect(adjustmentNotice([], 'system')).toBeNull()
  })

  it('joins several in one line', () => {
    expect(
      adjustmentNotice([{ mode: 'dark', token: 'bg' }, { mode: 'dark', token: 'accent-ink' }], 'dark'),
    ).toBe(
      'Tu fondo es claro: en modo oscuro se usa una versión más oscura. Tu color principal, como texto sobre fondo oscuro, se aclara un poco para que se lea.',
    )
  })
})

describe('clubInitials', () => {
  it('takes the first letter of the first two words', () => {
    expect(clubInitials('Rustic Pádel')).toBe('RP')
    expect(clubInitials('  club  del lago ')).toBe('CD')
    expect(clubInitials('Rustic')).toBe('R')
  })
})

describe('brandViewport', () => {
  it("colors the browser bar with each mode's background, following the device", () => {
    expect(brandViewport(DEFAULT_BRAND)).toEqual({
      themeColor: [
        { media: '(prefers-color-scheme: dark)', color: '#021716' },
        { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
      ],
      colorScheme: 'dark light',
    })
  })

  it('uses only the mode the club chose', () => {
    expect(brandViewport({ ...DEFAULT_BRAND, mode: 'dark' })).toEqual({ themeColor: '#021716', colorScheme: 'dark' })
    expect(brandViewport({ ...DEFAULT_BRAND, mode: 'light' })).toEqual({ themeColor: '#FFFFFF', colorScheme: 'light' })
  })
})

describe('webManifest', () => {
  it("installs the app with the club's name, background and icons", () => {
    const manifest = webManifest('Rustic Pádel', DEFAULT_BRAND)
    expect(manifest).toMatchObject({
      name: 'Rustic Pádel',
      short_name: 'Rustic Pádel',
      start_url: '/',
      display: 'standalone',
      background_color: '#021716',
      theme_color: '#021716',
    })
    expect(manifest.icons).toEqual([
      { src: '/icon', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ])
    expect(webManifest('Rustic Pádel', { ...DEFAULT_BRAND, mode: 'light' }).theme_color).toBe('#FFFFFF')
  })
})
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run tests/unit/lib/domain/club-brand.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/domain/club-brand"`).

- [ ] **Step 3: El módulo**

Create `lib/domain/club-brand.ts`:
```ts
import type { MetadataRoute, Viewport } from 'next'
import {
  clubTheme,
  DEFAULT_BACKGROUND,
  DEFAULT_PRIMARY,
  type Adjustment,
  type BrandColors,
  type ColorMode,
} from './club-theme'
import type { ParseResult } from './settings'

export type Brand = BrandColors & { mode: ColorMode }
type BrandRow = { brand_primary: string; brand_background: string; color_mode: ColorMode }

export const COLOR_MODES = ['system', 'dark', 'light'] as const satisfies readonly ColorMode[]
export const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  system: 'Según el dispositivo',
  dark: 'Siempre oscuro',
  light: 'Siempre claro',
}
export const DEFAULT_BRAND: Brand = { primary: DEFAULT_PRIMARY, background: DEFAULT_BACKGROUND, mode: 'system' }

const HEX6 = /^#?([0-9a-f]{6})$/i

// '#fcb021', 'fcb021' or ' #FCB021 ' → '#FCB021'. Anything else (#FFF, names) → null.
export function normalizeHex(value: string): string | null {
  const match = HEX6.exec(value.trim())
  return match ? `#${match[1].toUpperCase()}` : null
}

export function brandOf(club: BrandRow): Brand {
  return { primary: club.brand_primary, background: club.brand_background, mode: club.color_mode }
}

// Ajustes → "Marca del club". The RPC checks again; this gives the admin a message per field.
export function parseBrandForm(form: FormData): ParseResult<Brand> {
  const read = (name: string) => {
    const value = form.get(name)
    return typeof value === 'string' ? value : ''
  }
  const primary = normalizeHex(read('primary'))
  if (!primary) return { ok: false, message: 'Revisá el color principal: tiene que ser #RRGGBB, por ejemplo #FCB021.' }
  const background = normalizeHex(read('background'))
  if (!background) return { ok: false, message: 'Revisá el color de fondo: tiene que ser #RRGGBB, por ejemplo #021716.' }
  const mode = read('mode')
  if (!(COLOR_MODES as readonly string[]).includes(mode)) return { ok: false, message: 'Elegí cómo se ve la app.' }
  return { ok: true, value: { primary, background, mode: mode as ColorMode } }
}

const NOTICES: { [A in Adjustment as `${A['mode']}:${A['token']}`]: string } = {
  'dark:bg': 'Tu fondo es claro: en modo oscuro se usa una versión más oscura.',
  'dark:accent-ink': 'Tu color principal, como texto sobre fondo oscuro, se aclara un poco para que se lea.',
  'light:accent-ink': 'Tu color principal, como texto sobre fondo claro, se oscurece un poco para que se lea.',
}

// One line for the notice under the preview: only what the chosen mode will show. null when nothing changed.
export function adjustmentNotice(adjusted: Adjustment[], mode: ColorMode): string | null {
  const shown = adjusted.filter((adjustment) => mode === 'system' || adjustment.mode === mode)
  return shown.length === 0 ? null : shown.map((adjustment) => NOTICES[`${adjustment.mode}:${adjustment.token}` as keyof typeof NOTICES]).join(' ')
}

// "Rustic Pádel" → "RP": for the icon and the placeholder logo while the club has none.
export function clubInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
}

// The browser bar: the background of the mode the club shows (both, following the device, with 'system').
export function brandViewport(brand: Brand): Pick<Viewport, 'themeColor' | 'colorScheme'> {
  const theme = clubTheme(brand)
  if (brand.mode === 'dark') return { themeColor: theme.dark.bg, colorScheme: 'dark' }
  if (brand.mode === 'light') return { themeColor: theme.light.bg, colorScheme: 'light' }
  return {
    themeColor: [
      { media: '(prefers-color-scheme: dark)', color: theme.dark.bg },
      { media: '(prefers-color-scheme: light)', color: theme.light.bg },
    ],
    colorScheme: 'dark light',
  }
}

// app/manifest.ts: the app installed on the phone, with the club's name, colors and icon.
export function webManifest(name: string, brand: Brand): MetadataRoute.Manifest {
  const theme = clubTheme(brand)
  const tokens = brand.mode === 'light' ? theme.light : theme.dark
  return {
    name,
    short_name: name,
    description: `Reservá cancha y armá partido en ${name}.`,
    start_url: '/',
    display: 'standalone',
    background_color: tokens.bg,
    theme_color: tokens.bg,
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  }
}
```

- [ ] **Step 4: Verlo pasar**

Run: `npx vitest run tests/unit/lib/domain/club-brand.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/club-brand.ts tests/unit/lib/domain/club-brand.test.ts
git commit -m "feat(marca): brand form, notice, initials, viewport and manifest"
```

---

### Task 8: Los textos de las vistas previas

**Files:**
- Create: `lib/domain/share-preview.ts`
- Test: `tests/unit/lib/domain/share-preview.test.ts`

- [ ] **Step 1: El test**

Create `tests/unit/lib/domain/share-preview.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { championshipPreview, clubPreview, matchPreview, readMatchPreview } from '@/lib/domain/share-preview'
import { makeChampionship, TIMEZONE } from '../../fixtures/championships'

// Thursday 2026-10-15, 23:00 UTC = 20:00 in Montevideo.
const STARTS_AT = '2026-10-15T23:00:00+00:00'

describe('readMatchPreview', () => {
  it('reads what match_preview returns', () => {
    expect(readMatchPreview({ starts_at: STARTS_AT, open_sides: ['backhand'] })).toEqual({
      startsAt: new Date(STARTS_AT),
      openSides: ['backhand'],
    })
  })

  it('gives null for no match, a bad date, or nothing missing', () => {
    expect(readMatchPreview(null)).toBeNull()
    expect(readMatchPreview({ starts_at: 'mañana', open_sides: ['drive'] })).toBeNull()
    expect(readMatchPreview({ starts_at: STARTS_AT, open_sides: [] })).toBeNull()
    expect(readMatchPreview({ starts_at: STARTS_AT, open_sides: ['both'] })).toBeNull()
  })
})

describe('matchPreview', () => {
  it('says what is missing, the day and the time, without names', () => {
    expect(matchPreview({ startsAt: new Date(STARTS_AT), openSides: ['backhand'] }, 'Rustic Pádel', TIMEZONE)).toEqual({
      title: 'Falta 1 de revés · jue 20:00',
      description: 'Sumate al partido en Rustic Pádel.',
    })
  })

  it('counts each side when more are missing', () => {
    const preview = matchPreview({ startsAt: new Date(STARTS_AT), openSides: ['backhand', 'drive', 'backhand'] }, 'Rustic Pádel', TIMEZONE)
    expect(preview.title).toBe('Faltan 3: 1 de drive y 2 de revés · jue 20:00')
  })
})

describe('championshipPreview', () => {
  it('shows the name and the dates', () => {
    expect(championshipPreview(makeChampionship())).toEqual({
      title: 'Campeonato de Primavera',
      description: 'Del sábado 17 de octubre al domingo 18 de octubre',
    })
  })
})

describe('clubPreview', () => {
  it('shows the club for any other link', () => {
    expect(clubPreview('Rustic Pádel')).toEqual({ title: 'Rustic Pádel', description: 'Reservá cancha y armá partido.' })
  })
})
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run tests/unit/lib/domain/share-preview.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/domain/share-preview"`).

- [ ] **Step 3: Los textos**

Create `lib/domain/share-preview.ts`:
```ts
import { datesText, type Championship } from './championships'
import { WEEKDAYS_SHORT, timeIn } from './format'
import { missingText, SLOT_SIDES, type SlotSide } from './matches'
import { localDateOf, weekdayOf } from './time'

// What WhatsApp shows for a shared link: a title and a line under it.
export type SharePreview = { title: string; description: string }
export type MatchPreview = { startsAt: Date; openSides: SlotSide[] }

// What public.match_preview returns, or null.
export function readMatchPreview(data: unknown): MatchPreview | null {
  if (typeof data !== 'object' || data === null) return null
  const { starts_at: startsAt, open_sides: openSides } = data as Record<string, unknown>
  if (typeof startsAt !== 'string' || !Array.isArray(openSides)) return null
  const date = new Date(startsAt)
  if (Number.isNaN(date.getTime())) return null
  const sides = openSides.filter((side): side is SlotSide => (SLOT_SIDES as readonly unknown[]).includes(side))
  return sides.length === 0 ? null : { startsAt: date, openSides: sides }
}

// "Falta 1 de revés · jue 20:00": day, time and what is missing. Never names.
export function matchPreview(preview: MatchPreview, clubName: string, timezone: string): SharePreview {
  const slots = preview.openSides.map((side, index) => ({ position: index + 1, side, playerId: null, playerName: null }))
  const day = WEEKDAYS_SHORT[weekdayOf(localDateOf(preview.startsAt, timezone))]
  return {
    title: `${missingText({ slots })} · ${day} ${timeIn(preview.startsAt, timezone)}`,
    description: `Sumate al partido en ${clubName}.`,
  }
}

// Any page without a preview of its own: the club.
export function clubPreview(clubName: string): SharePreview {
  return { title: clubName, description: 'Reservá cancha y armá partido.' }
}

export function championshipPreview(championship: Pick<Championship, 'name' | 'windows'>): SharePreview {
  return { title: championship.name, description: datesText(championship) }
}
```

- [ ] **Step 4: Verlo pasar y commit**

Run: `npx vitest run tests/unit/lib/domain/share-preview.test.ts`
Expected: PASS (6 tests).

```bash
git add lib/domain/share-preview.ts tests/unit/lib/domain/share-preview.test.ts
git commit -m "feat(marca): share preview texts for the club, a championship and an open match"
```

---

## Corte 3: La app con la marca

### Task 9: El tema en el layout raíz y el logo de reemplazo

**Files:**
- Modify: `app/layout.tsx` (entero)
- Modify: `components/brand/logo.tsx` (entero)
- Modify: `components/brand/club-logo.tsx:11`
- Test: `tests/unit/components/brand/club-logo.test.tsx`

- [ ] **Step 1: El test del logo de reemplazo**

In `tests/unit/components/brand/club-logo.test.tsx`, replace:
```tsx
    expect(screen.getByRole('img', { name: 'Rustic Pádel' }).tagName.toLowerCase()).toBe('svg')
  })
```
with:
```tsx
    expect(screen.getByRole('img', { name: 'Rustic Pádel' }).tagName.toLowerCase()).toBe('svg')
  })

  it("draws the placeholder with the club's initials on its primary color", () => {
    render(<ClubLogo club={{ name: 'Club del Lago', logo_path: null }} />)
    const placeholder = screen.getByRole('img', { name: 'Club del Lago' })
    expect(placeholder).toHaveTextContent('CD')
    expect(placeholder.querySelector('circle')).toHaveAttribute('fill', 'var(--accent)')
  })
```

Run: `npx vitest run tests/unit/components/brand/club-logo.test.tsx`
Expected: FAIL (el nombre accesible del reemplazo es siempre "Rustic Pádel").

- [ ] **Step 2: El logo de reemplazo con los tokens**

Replace the whole `components/brand/logo.tsx` with:
```tsx
import { clubInitials } from '@/lib/domain/club-brand'

// Placeholder until the club uploads its logo: its initials on its primary color (the tokens follow the club).
export function Logo({ name, className }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label={name} className={className}>
      <circle cx="32" cy="32" r="30" fill="var(--accent)" />
      <text
        x="32"
        y="41"
        textAnchor="middle"
        fontFamily="var(--font-barlow-condensed), sans-serif"
        fontWeight="700"
        fontSize="26"
        fill="var(--on-accent)"
      >
        {clubInitials(name)}
      </text>
    </svg>
  )
}
```

In `components/brand/club-logo.tsx`, replace:
```tsx
  if (!url) return <Logo className={className} />
```
with:
```tsx
  if (!url) return <Logo name={club.name} className={className} />
```

Run: `npx vitest run tests/unit/components/brand/club-logo.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 3: El layout raíz escribe el tema**

Replace the whole `app/layout.tsx` with:
```tsx
import type { Metadata, Viewport } from 'next'
import { Barlow, Barlow_Condensed } from 'next/font/google'
import { ActivityProvider } from '@/components/ui/activity'
import { getSiteUrl } from '@/lib/auth/redirect'
import { getClub } from '@/lib/auth/viewer'
import { brandOf, brandViewport } from '@/lib/domain/club-brand'
import { clubTheme, themeCss } from '@/lib/domain/club-theme'
import './globals.css'

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-barlow',
  display: 'swap',
})

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['700'],
  variable: '--font-barlow-condensed',
  display: 'swap',
})

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getClub()
  const description = `Reservá cancha y armá partido en ${name}.`
  return {
    metadataBase: new URL(getSiteUrl()),
    title: { default: name, template: `%s · ${name}` },
    description,
    openGraph: { title: name, description, siteName: name, locale: 'es_UY', type: 'website' },
  }
}

export async function generateViewport(): Promise<Viewport> {
  return { width: 'device-width', initialScale: 1, ...brandViewport(brandOf(await getClub())) }
}

// The club's colors, written by the server before anything paints (no flash). globals.css keeps Rustic's as a
// fallback and maps the tokens to Tailwind; this style replaces their values.
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const brand = brandOf(await getClub())
  return (
    <html lang="es" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <head>
        <style id="club-theme" dangerouslySetInnerHTML={{ __html: themeCss(clubTheme(brand), brand.mode) }} />
      </head>
      <body className="min-h-dvh bg-bg font-sans text-fg antialiased">
        <ActivityProvider>{children}</ActivityProvider>
      </body>
    </html>
  )
}
```

`themeCss` solo escribe hex que `clubTheme` validó (o los de Rustic), así que el `dangerouslySetInnerHTML` no lleva nada que haya tipeado alguien.

- [ ] **Step 4: Typecheck, lint y commit**

Run:
```bash
npm run typecheck
npm run lint
```
Expected: sin errores.

```bash
git add app/layout.tsx components/brand/logo.tsx components/brand/club-logo.tsx tests/unit/components/brand/club-logo.test.tsx
git commit -m "feat(marca): the root layout writes the club's theme; the placeholder logo follows it"
```

---

### Task 10: Ajustes guarda la marca

**Files:**
- Modify: `app/(club)/club/ajustes/actions.ts` (imports y al final)
- Test: `tests/unit/lib/actions/club-brand-actions.test.ts`

- [ ] **Step 1: El test**

Create `tests/unit/lib/actions/club-brand-actions.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ role: 'admin' as 'player' | 'reception' | 'admin' }))
const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: null; error: { message: string } | null }>>(
  async () => ({ data: null, error: null }),
)
const revalidateBookings = vi.fn()

vi.mock('server-only', () => ({}))
vi.mock('@/lib/actions/revalidate', () => ({ revalidateBookings }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
vi.mock('@/lib/auth/viewer', () => ({
  getViewer: async () => ({ club: { id: 'a0000000-0000-0000-0000-000000000001' }, membership: { role: state.role } }),
}))

const { saveClubBrand } = await import('@/app/(club)/club/ajustes/actions')
const { errorMessage } = await import('@/lib/domain/errors')
const IDLE = { status: 'idle' as const }

function form(values: Record<string, string>): FormData {
  const data = new FormData()
  for (const [name, value] of Object.entries(values)) data.set(name, value)
  return data
}

beforeEach(() => {
  state.role = 'admin'
  rpc.mockClear()
  revalidateBookings.mockClear()
})

describe('saveClubBrand', () => {
  it('saves both colors in upper case and the mode, and refreshes the app', async () => {
    const result = await saveClubBrand(IDLE, form({ primary: '#e11d48', background: '#1a1a2e', mode: 'dark' }))
    expect(result).toEqual({ status: 'ok', message: 'Marca guardada. Se ve en toda la app al recargar.' })
    expect(rpc).toHaveBeenCalledWith('save_club_brand', {
      p_club_id: 'a0000000-0000-0000-0000-000000000001',
      p_primary: '#E11D48',
      p_background: '#1A1A2E',
      p_mode: 'dark',
    })
    expect(revalidateBookings).toHaveBeenCalled()
  })

  it('explains a wrong color before the database, and lets only admins in', async () => {
    expect(await saveClubBrand(IDLE, form({ primary: 'rojo', background: '#021716', mode: 'system' }))).toEqual({
      status: 'error',
      message: 'Revisá el color principal: tiene que ser #RRGGBB, por ejemplo #FCB021.',
    })
    state.role = 'reception'
    expect(await saveClubBrand(IDLE, form({ primary: '#FCB021', background: '#021716', mode: 'system' }))).toEqual({
      status: 'error',
      message: errorMessage('forbidden'),
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('shows what the database refused', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'invalid_color' } })
    expect(await saveClubBrand(IDLE, form({ primary: '#FCB021', background: '#021716', mode: 'system' }))).toEqual({
      status: 'error',
      message: errorMessage('invalid_color'),
    })
    expect(revalidateBookings).not.toHaveBeenCalled()
  })
})
```

Run: `npx vitest run tests/unit/lib/actions/club-brand-actions.test.ts`
Expected: FAIL (`saveClubBrand is not a function`).

- [ ] **Step 2: La acción**

In `app/(club)/club/ajustes/actions.ts`, replace:
```ts
import { failed, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
```
with:
```ts
import { failed, fromRpc, INVALID_INPUT, ok, type ActionState } from '@/lib/actions/result'
```
and replace:
```ts
import { isClubLogoPath } from '@/lib/domain/club-logo'
```
with:
```ts
import { parseBrandForm } from '@/lib/domain/club-brand'
import { isClubLogoPath } from '@/lib/domain/club-logo'
```
and append at the end of the file:
```ts

// Ajustes → "Marca del club": two colors and the mode, through save_club_brand (admins of the club only).
export async function saveClubBrand(_previous: ActionState, form: FormData): Promise<ActionState> {
  const clubId = await adminClubId()
  if (!clubId) return FORBIDDEN
  const parsed = parseBrandForm(form)
  if (!parsed.ok) return failed(parsed.message)

  const supabase = await createClient()
  const { primary, background, mode } = parsed.value
  const { error } = await supabase.rpc('save_club_brand', {
    p_club_id: clubId,
    p_primary: primary,
    p_background: background,
    p_mode: mode,
  })
  if (!error) revalidateBookings()
  return fromRpc(error, 'Marca guardada. Se ve en toda la app al recargar.')
}
```

- [ ] **Step 3: Verlo pasar y commit**

Run: `npx vitest run tests/unit/lib/actions/club-brand-actions.test.ts tests/unit/lib/actions/club-logo-actions.test.ts`
Expected: PASS (3 + 3 tests).

```bash
git add "app/(club)/club/ajustes/actions.ts" tests/unit/lib/actions/club-brand-actions.test.ts
git commit -m "feat(marca): saveClubBrand server action"
```

---

### Task 11: Ajustes → "Marca del club" con vista previa

**Files:**
- Create: `components/club/brand-form.tsx`
- Modify: `app/(club)/club/ajustes/page.tsx` (imports y una sección después de "Logo")
- Test: `tests/unit/components/club/brand-form.test.tsx`

- [ ] **Step 1: El test**

Create `tests/unit/components/club/brand-form.test.tsx`:
```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BrandForm, type BrandFormProps } from '@/components/club/brand-form'

vi.mock('@/lib/supabase/env', () => ({ getSupabaseEnv: () => ({ url: 'https://x.supabase.co', publishableKey: 'k' }) }))

const RUSTIC: BrandFormProps['club'] = {
  name: 'Rustic Pádel',
  logo_path: null,
  brand_primary: '#FCB021',
  brand_background: '#021716',
  color_mode: 'system',
}

function renderForm(club: Partial<BrandFormProps['club']> = {}) {
  const action = vi.fn<BrandFormProps['action']>(async () => ({ status: 'ok', message: 'Marca guardada.' }))
  render(<BrandForm club={{ ...RUSTIC, ...club }} action={action} />)
  return action
}

const preview = (mode: 'oscuro' | 'claro') => screen.getByRole('region', { name: `Vista previa en modo ${mode}` })

describe('BrandForm', () => {
  it('previews both modes with the colors being typed, before saving', async () => {
    renderForm()
    expect(preview('oscuro').style.getPropertyValue('--accent')).toBe('#FCB021')
    expect(preview('claro').style.getPropertyValue('--accent-ink')).toBe('#8A5A00')
    const primary = screen.getByLabelText('Color principal')
    await userEvent.clear(primary)
    await userEvent.type(primary, '#1d4ed8')
    expect(preview('oscuro').style.getPropertyValue('--accent')).toBe('#1D4ED8')
    expect(preview('claro').style.getPropertyValue('--accent')).toBe('#1D4ED8')
    expect(within(preview('oscuro')).getByText('Rustic Pádel')).toBeInTheDocument()
    expect(within(preview('oscuro')).getByText('En juego')).toBeInTheDocument()
    expect(within(preview('oscuro')).getAllByText('Falta')).toHaveLength(2)
  })

  it('keeps the last full color in the preview while a #RRGGBB is half typed', async () => {
    renderForm()
    const primary = screen.getByLabelText('Color principal')
    await userEvent.clear(primary)
    await userEvent.type(primary, '#1d4')
    expect(preview('oscuro').style.getPropertyValue('--accent')).toBe('#FCB021')
  })

  it('tells what the calculation corrected, for the modes the club shows', async () => {
    renderForm()
    expect(screen.getByRole('note')).toHaveTextContent(
      'Tu color principal, como texto sobre fondo claro, se oscurece un poco para que se lea.',
    )
    await userEvent.click(screen.getByRole('radio', { name: 'Siempre oscuro' }))
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('goes back to the original colors without saving', async () => {
    const action = renderForm({ brand_primary: '#E11D48', brand_background: '#1A1A2E', color_mode: 'dark' })
    await userEvent.click(screen.getByRole('button', { name: 'Volver a los colores originales' }))
    expect(screen.getByLabelText('Color principal')).toHaveValue('#FCB021')
    expect(screen.getByLabelText('Color de fondo')).toHaveValue('#021716')
    expect(screen.getByRole('radio', { name: 'Según el dispositivo' })).toBeChecked()
    expect(action).not.toHaveBeenCalled()
  })

  it('saves the colors and the mode', async () => {
    const action = renderForm()
    await userEvent.click(screen.getByRole('radio', { name: 'Siempre claro' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar marca' }))
    await waitFor(() => expect(action).toHaveBeenCalled())
    const sent = action.mock.calls[0][1]
    expect(Object.fromEntries(sent.entries())).toEqual({ primary: '#FCB021', background: '#021716', mode: 'light' })
    expect(await screen.findByRole('status')).toHaveTextContent('Marca guardada.')
  })
})
```

Run: `npx vitest run tests/unit/components/club/brand-form.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/club/brand-form"`).

- [ ] **Step 2: El formulario**

Create `components/club/brand-form.tsx`:
```tsx
'use client'

import { useState, type CSSProperties } from 'react'
import { ClubLogo } from '@/components/brand/club-logo'
import { MatchCourt } from '@/components/matches/match-court'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Field, inputClasses } from '@/components/ui/field'
import { adjustmentNotice, COLOR_MODE_LABELS, COLOR_MODES, DEFAULT_BRAND, normalizeHex } from '@/lib/domain/club-brand'
import { clubTheme, THEME_TOKENS, type ColorMode, type ThemeMode, type Tokens } from '@/lib/domain/club-theme'
import type { MatchSlot } from '@/lib/domain/matches'

export type BrandFormProps = {
  club: { name: string; logo_path: string | null; brand_primary: string; brand_background: string; color_mode: ColorMode }
  action: FormAction
}

// Two players and two missing spots: how a taken spot and a missing one look, side by side.
const SAMPLE_SLOTS: MatchSlot[] = [
  { position: 1, side: 'drive', playerId: 'ana', playerName: 'Ana' },
  { position: 2, side: 'backhand', playerId: null, playerName: null },
  { position: 3, side: 'drive', playerId: 'bruno', playerName: 'Bruno' },
  { position: 4, side: 'backhand', playerId: null, playerName: null },
]

function tokenStyle(tokens: Tokens, mode: ThemeMode): CSSProperties {
  return { colorScheme: mode, ...Object.fromEntries(THEME_TOKENS.map((token) => [`--${token}`, tokens[token]])) }
}

// Ajustes → "Marca del club": the two colors (picker and #RRGGBB), the mode and a live preview in both modes.
export function BrandForm({ club, action }: BrandFormProps) {
  const [primaryText, setPrimaryText] = useState(club.brand_primary)
  const [backgroundText, setBackgroundText] = useState(club.brand_background)
  const [mode, setMode] = useState<ColorMode>(club.color_mode)
  const primary = normalizeHex(primaryText)
  const background = normalizeHex(backgroundText)
  // An unfinished #RRGGBB previews as the saved color until it is complete.
  const theme = clubTheme({ primary: primary ?? club.brand_primary, background: background ?? club.brand_background })
  const notice = adjustmentNotice(theme.adjusted, mode)

  const reset = () => {
    setPrimaryText(DEFAULT_BRAND.primary)
    setBackgroundText(DEFAULT_BRAND.background)
    setMode(DEFAULT_BRAND.mode)
  }

  const colorField = (
    id: string,
    name: string,
    label: string,
    text: string,
    setText: (value: string) => void,
    value: string | null,
  ) => (
    <Field label={label} htmlFor={id}>
      <div className="flex items-center gap-3">
        <input
          type="color"
          aria-label={`Elegir el ${label.toLowerCase()}`}
          value={(value ?? '#000000').toLowerCase()}
          onChange={(event) => setText(event.target.value.toUpperCase())}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-border bg-bg p-1"
        />
        <input
          id={id}
          name={name}
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={value === null || undefined}
          className={`${inputClasses} font-mono uppercase`}
        />
      </div>
    </Field>
  )

  return (
    <ActionForm action={action} submitLabel="Guardar marca">
      <div className="grid gap-3 md:grid-cols-2">
        {colorField('brand-primary', 'primary', 'Color principal', primaryText, setPrimaryText, primary)}
        {colorField('brand-background', 'background', 'Color de fondo', backgroundText, setBackgroundText, background)}
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-semibold">Modo</legend>
        {COLOR_MODES.map((value) => (
          <label key={value} className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name="mode"
              value={value}
              checked={mode === value}
              onChange={() => setMode(value)}
              className="size-5 accent-accent"
            />
            {COLOR_MODE_LABELS[value]}
          </label>
        ))}
      </fieldset>

      <div className="grid gap-3 md:grid-cols-2">
        <Preview label="Oscuro" mode="dark" tokens={theme.dark} club={club} />
        <Preview label="Claro" mode="light" tokens={theme.light} club={club} />
      </div>
      {notice ? (
        <p role="note" className="text-sm text-fg-muted">
          {notice}
        </p>
      ) : null}
      <Button type="button" variant="ghost" onClick={reset}>
        Volver a los colores originales
      </Button>
    </ActionForm>
  )
}

function Preview({
  label,
  mode,
  tokens,
  club,
}: {
  label: string
  mode: ThemeMode
  tokens: Tokens
  club: BrandFormProps['club']
}) {
  return (
    <section
      aria-label={`Vista previa en modo ${label.toLowerCase()}`}
      style={tokenStyle(tokens, mode)}
      className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-bg p-3 text-fg"
    >
      <div className="flex items-center gap-2 border-b border-border pb-2 font-display text-lg font-bold uppercase">
        <ClubLogo club={club} className="size-7" />
        {club.name}
      </div>
      <span className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 font-display text-lg font-bold uppercase text-on-accent">
        Reservar
      </span>
      <div className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-3">
        <div className="flex items-center justify-between gap-2">
          <b>Cancha 1 · 20:00</b>
          <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold uppercase text-on-accent">En juego</span>
        </div>
        <p className="text-sm text-fg-muted">Texto suave, como las aclaraciones.</p>
        <p className="text-sm font-semibold text-accent-ink">Ver el partido</p>
      </div>
      <MatchCourt match={{ slots: SAMPLE_SLOTS }} viewerId="preview" />
    </section>
  )
}
```

Run: `npx vitest run tests/unit/components/club/brand-form.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 3: La sección en Ajustes**

In `app/(club)/club/ajustes/page.tsx`, replace:
```tsx
import { LogoForm } from '@/components/club/logo-form'
```
with:
```tsx
import { BrandForm } from '@/components/club/brand-form'
import { LogoForm } from '@/components/club/logo-form'
```
replace:
```tsx
import { addCourt, addPricingRule, deleteCourt, deletePricingRule, updateClubSettings, updateCourt, updateLoyalty, removeClubLogo, saveClubLogo } from './actions'
```
with:
```tsx
import { addCourt, addPricingRule, deleteCourt, deletePricingRule, updateClubSettings, updateCourt, updateLoyalty, removeClubLogo, saveClubBrand, saveClubLogo } from './actions'
```
and replace:
```tsx
          <LogoForm club={club} saveAction={saveClubLogo} removeAction={removeClubLogo} />
        </Card>
      </section>
```
with:
```tsx
          <LogoForm club={club} saveAction={saveClubLogo} removeAction={removeClubLogo} />
        </Card>
      </section>

      <section aria-labelledby="marca" className="flex flex-col gap-3">
        <h2 id="marca" className="font-display text-2xl font-bold uppercase">
          Marca del club
        </h2>
        <p className="text-sm text-fg-muted">
          El color principal va en los botones y lo que se destaca; el fondo, detrás de todo. La app arma el resto y
          corrige lo que haga falta para que todo se lea.
        </p>
        <Card>
          <BrandForm club={club} action={saveClubBrand} />
        </Card>
      </section>
```

- [ ] **Step 4: Typecheck y commit**

Run: `npm run typecheck`
Expected: sin errores.

```bash
git add components/club/brand-form.tsx "app/(club)/club/ajustes/page.tsx" tests/unit/components/club/brand-form.test.tsx
git commit -m "feat(marca): Ajustes, brand colors and mode with a live preview in both modes"
```

---

### Task 12: El lugar que falta es un hueco oscuro

**Files:**
- Modify: `components/matches/match-court.tsx` (el último `return` de `Spot`)
- Test: `tests/unit/components/matches/match-court.test.tsx`

- [ ] **Step 1: El test**

In `tests/unit/components/matches/match-court.test.tsx`, replace:
```tsx
  it('lets the viewer tap a spot he can take', async () => {
```
with:
```tsx
  it('draws a missing spot as a hole with the club colors, unlike a taken one', () => {
    render(<MatchCourt match={withPlayers(makeMatch(), ['ana', null, null, null])} viewerId="me" />)
    const missing = screen.getAllByText('Falta')[0].parentElement!
    expect(missing).toHaveClass('bg-bg', 'border-dashed', 'border-accent', 'text-accent-ink')
    expect(missing).not.toHaveClass('border-on-court')
    const taken = screen.getByText('Jugador').parentElement!
    expect(taken).toHaveClass('border-on-court')
    expect(taken).not.toHaveClass('bg-bg')
  })

  it('lets the viewer tap a spot he can take', async () => {
```

Run: `npx vitest run tests/unit/components/matches/match-court.test.tsx`
Expected: FAIL (el lugar que falta tiene `border-on-court`).

- [ ] **Step 2: El hueco**

In `components/matches/match-court.tsx`, replace:
```tsx
  return (
    <div className={cn(SPOT, 'border border-dashed border-on-court')}>
      <b>Falta</b>
      <span className="text-xs">{side}</span>
    </div>
  )
}
```
with:
```tsx
  // A hole in the court: the club's background with a dashed edge, so it never reads as a taken spot.
  return (
    <div className={cn(SPOT, 'border-2 border-dashed border-accent bg-bg text-accent-ink')}>
      <b>Falta</b>
      <span className="text-xs">{side}</span>
    </div>
  )
}
```

- [ ] **Step 3: Verlo pasar y commit**

Run: `npx vitest run tests/unit/components/matches`
Expected: PASS (6 archivos, 12 tests).

```bash
git add components/matches/match-court.tsx tests/unit/components/matches/match-court.test.tsx
git commit -m "feat(marca): a missing spot on the court is a dark hole, not a blue one"
```

---

### Task 13: Los mails con los colores del club

**Files:**
- Modify: `lib/notify/messages.ts`
- Modify: `lib/notify/outbox.ts:27`
- Test: `tests/unit/lib/notify/messages.test.ts`, `tests/unit/lib/notify/outbox.test.ts`, `tests/unit/lib/notify/send-pending.test.ts`

- [ ] **Step 1: Los tests**

In `tests/unit/lib/notify/messages.test.ts`, replace:
```ts
  clubLogoPath: 'club-1/logo-1.png',
}
```
with:
```ts
  clubLogoPath: 'club-1/logo-1.png',
  clubPrimary: '#FCB021',
  clubBackground: '#021716',
}
```
and replace:
```ts
  it('escapes what people typed', () => {
```
with:
```ts
  it("paints the mail with the club's colors, in its dark version", () => {
    const mail = buildEmail({ ...HELD, clubPrimary: '#E11D48', clubBackground: '#1A1A2E' }, URLS)!
    expect(mail.html).toContain('<body style="margin:0;background:#1A1A2E;')
    expect(mail.html).toContain('display:inline-block;background:#E11D48;')
    expect(mail.html).not.toContain('#FCB021')
    expect(mail.html).not.toContain('#021716')
  })

  it('escapes what people typed', () => {
```

In `tests/unit/lib/notify/outbox.test.ts`, replace:
```ts
  club_logo_path: null,
}
```
with:
```ts
  club_logo_path: null,
  club_brand_primary: '#FCB021',
  club_brand_background: '#021716',
}
```

In `tests/unit/lib/notify/send-pending.test.ts`, replace:
```ts
    clubLogoPath: null,
    ...overrides,
```
with:
```ts
    clubLogoPath: null,
    clubPrimary: '#FCB021',
    clubBackground: '#021716',
    ...overrides,
```

Run: `npx vitest run tests/unit/lib/notify`
Expected: FAIL (`paints the mail with the club's colors`: el html tiene `#021716`).

- [ ] **Step 2: El mail toma la paleta oscura del club**

In `lib/notify/messages.ts`, replace:
```ts
import { clubLogoUrl } from '@/lib/domain/club-logo'
```
with:
```ts
import { clubLogoUrl } from '@/lib/domain/club-logo'
import { clubTheme } from '@/lib/domain/club-theme'
```
replace:
```ts
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
```
with:
```ts
  clubLogoPath: string | null
  clubPrimary: string
  clubBackground: string
}
```
and replace from `  const footer = …` to the end of the `html` array:
```ts
  const footer = `${item.clubName}: ${content.reason}`
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
```
with:
```ts
  const footer = `${item.clubName}: ${content.reason}`
  // The club's dark palette, always: mail apps ignore the device's mode in a mail's own colors.
  const colors = clubTheme({ primary: item.clubPrimary, background: item.clubBackground }).dark
  const brand = logo
    ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(item.clubName)}" width="56" height="56" style="display:block;border-radius:12px;margin:0 0 16px">`
    : `<p style="margin:0 0 16px;font-weight:bold;color:${colors['accent-ink']}">${escapeHtml(item.clubName)}</p>`
  const html = [
    '<!doctype html>',
    `<html lang="es"><body style="margin:0;background:${colors.bg};font-family:Arial,Helvetica,sans-serif;color:${colors.fg}">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.bg}"><tr><td align="center" style="padding:24px 16px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${colors.surface};border-radius:16px"><tr><td style="padding:24px">`,
    brand,
    `<p style="margin:0 0 8px;color:${colors['fg-muted']}">${escapeHtml(greeting)}</p>`,
    `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:${colors.fg}">${escapeHtml(title)}</h1>`,
    `<p style="margin:0 0 20px;line-height:1.5;color:${colors['fg-muted']}">${escapeHtml(body)}</p>`,
    `<a href="${escapeHtml(link)}" style="display:inline-block;background:${colors.accent};color:${colors['on-accent']};font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:12px">${button}</a>`,
    '</td></tr></table>',
    `<p style="margin:16px 0 0;font-size:12px;color:${colors['fg-muted']}">${escapeHtml(footer)}</p>`,
    '</td></tr></table></body></html>',
  ].join('')
```

In `lib/notify/outbox.ts`, replace:
```ts
        clubLogoPath: row.club_logo_path,
```
with:
```ts
        clubLogoPath: row.club_logo_path,
        clubPrimary: row.club_brand_primary,
        clubBackground: row.club_brand_background,
```

- [ ] **Step 3: Verlo pasar y commit**

Run:
```bash
npx vitest run tests/unit/lib/notify
npm run typecheck
```
Expected: PASS (4 archivos, 16 tests); typecheck sin errores.

```bash
git add lib/notify/messages.ts lib/notify/outbox.ts tests/unit/lib/notify/messages.test.ts tests/unit/lib/notify/outbox.test.ts tests/unit/lib/notify/send-pending.test.ts
git commit -m "feat(marca): avisos mails in the club's dark palette"
```

---

### Task 14: El logo del club en el modo TV

**Files:**
- Modify: `app/c/[code]/tv/tv-board.tsx`
- Modify: `app/c/[code]/tv/page.tsx`
- Test: `tests/unit/app/campeonatos/tv-board.test.tsx`

- [ ] **Step 1: El test**

In `tests/unit/app/campeonatos/tv-board.test.tsx`, replace:
```tsx
import { makeView } from '../../fixtures/championship-views'
```
with:
```tsx
import { makeView } from '../../fixtures/championship-views'

vi.mock('@/lib/supabase/env', () => ({ getSupabaseEnv: () => ({ url: 'https://x.supabase.co', publishableKey: 'k' }) }))

const CLUB = { name: 'Rustic Pádel', logo_path: 'c1/logo-1.png' }
```
replace:
```tsx
      <TvBoard
        name="Campeonato de Primavera"
```
with:
```tsx
      <TvBoard
        club={CLUB}
        name="Campeonato de Primavera"
```
and replace the last line of the file (`})`) with:
```tsx

  it("puts the club's logo big on top, next to the championship", () => {
    render(<TvBoard club={CLUB} name="Campeonato de Primavera" screens={[]} />)
    expect(screen.getByRole('img', { name: 'Rustic Pádel' })).toHaveAttribute(
      'src',
      'https://x.supabase.co/storage/v1/object/public/club-logos/c1/logo-1.png',
    )
    expect(screen.getByText('Campeonato de Primavera')).toBeInTheDocument()
  })
})
```

Run: `npx vitest run tests/unit/app/campeonatos/tv-board.test.tsx`
Expected: FAIL (no hay `img` "Rustic Pádel").

- [ ] **Step 2: El logo en el encabezado**

In `app/c/[code]/tv/tv-board.tsx`, replace:
```tsx
import { BracketView } from '@/components/championships/bracket-view'
```
with:
```tsx
import { ClubLogo } from '@/components/brand/club-logo'
import { BracketView } from '@/components/championships/bracket-view'
```
replace:
```tsx
export function TvBoard({ name, screens, seconds = 20 }: { name: string; screens: TvScreen[]; seconds?: number }) {
```
with:
```tsx
export type TvBoardProps = {
  club: { name: string; logo_path: string | null }
  name: string
  screens: TvScreen[]
  seconds?: number
}

export function TvBoard({ club, name, screens, seconds = 20 }: TvBoardProps) {
```
and replace:
```tsx
        <p className="font-display text-3xl font-bold uppercase text-fg-muted">{name}</p>
```
with:
```tsx
        <div className="flex min-w-0 items-center gap-6">
          <ClubLogo club={club} className="size-24 shrink-0" />
          <p className="font-display text-3xl font-bold uppercase text-fg-muted">{name}</p>
        </div>
```

In `app/c/[code]/tv/page.tsx`, replace:
```tsx
import { AutoRefresh } from '@/components/live/auto-refresh'
```
with:
```tsx
import { AutoRefresh } from '@/components/live/auto-refresh'
import { getClub } from '@/lib/auth/viewer'
```
replace:
```tsx
  const data = await loadPublicChampionship(code)
  if (!data) notFound()
```
with:
```tsx
  const [data, club] = await Promise.all([loadPublicChampionship(code), getClub()])
  if (!data) notFound()
```
and replace:
```tsx
      <TvBoard name={data.championship.name} screens={screens} />
```
with:
```tsx
      <TvBoard club={club} name={data.championship.name} screens={screens} />
```

- [ ] **Step 3: Verlo pasar, todo Vitest y commit**

Run:
```bash
npx vitest run tests/unit/app/campeonatos/tv-board.test.tsx
npm test
npm run typecheck
npm run lint
```
Expected: PASS (2 tests); Vitest completo en verde; sin errores.

```bash
git add "app/c/[code]/tv/tv-board.tsx" "app/c/[code]/tv/page.tsx" tests/unit/app/campeonatos/tv-board.test.tsx
git commit -m "feat(marca): the club's logo on the TV screen"
```

---

## Corte 4: Ícono y vistas previas

### Task 15: Ícono, manifest y vista previa del club

**Files:**
- Create: `lib/brand/logo-data-url.ts`, `lib/brand/load-brand.ts`, `lib/brand/brand-images.tsx`
- Create: `app/icon.tsx`, `app/apple-icon.tsx`, `app/manifest.ts`, `app/opengraph-image.tsx`
- Delete: `app/icon.svg`
- Test: `tests/unit/lib/brand/logo-data-url.test.ts`

- [ ] **Step 1: El test del logo como data URL**

Create `tests/unit/lib/brand/logo-data-url.test.ts`:
```ts
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { logoDataUrl } from '@/lib/brand/logo-data-url'

function answer(body: string, type: string, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(body, { status, headers: { 'content-type': type } }))
}

describe('logoDataUrl', () => {
  it('turns a PNG, JPEG or SVG logo into a data URL', async () => {
    expect(await logoDataUrl('https://db.test/logo.png', answer('png', 'image/png'))).toBe('data:image/png;base64,cG5n')
    expect(await logoDataUrl('https://db.test/logo.svg', answer('<svg/>', 'image/svg+xml; charset=utf-8'))).toBe(
      'data:image/svg+xml;base64,PHN2Zy8+',
    )
  })

  it('gives null without a logo, for WebP, or when Storage fails', async () => {
    const fetcher = answer('png', 'image/png')
    expect(await logoDataUrl(null, fetcher)).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
    expect(await logoDataUrl('https://db.test/logo.webp', answer('webp', 'image/webp'))).toBeNull()
    expect(await logoDataUrl('https://db.test/logo.png', answer('', 'text/plain', 404))).toBeNull()
    expect(await logoDataUrl('https://db.test/logo.png', vi.fn<typeof fetch>(async () => Promise.reject(new Error('offline'))))).toBeNull()
  })
})
```

Run: `npx vitest run tests/unit/lib/brand/logo-data-url.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/brand/logo-data-url"`).

- [ ] **Step 2: El logo como data URL**

Create `lib/brand/logo-data-url.ts`:
```ts
// The club's logo as a data: URL for ImageResponse, which draws PNG, JPEG and SVG but not WebP. null when there is
// no logo, it is WebP, too big, or Storage does not answer: the image falls back to the initials.
const DRAWABLE = ['image/png', 'image/jpeg', 'image/svg+xml']
const MAX_BYTES = 2 * 1024 * 1024

export async function logoDataUrl(url: string | null, fetcher: typeof fetch = fetch): Promise<string | null> {
  if (!url) return null
  try {
    const response = await fetcher(url)
    const type = response.headers.get('content-type')?.split(';')[0].trim() ?? ''
    if (!response.ok || !DRAWABLE.includes(type)) return null
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > MAX_BYTES) return null
    return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`
  } catch {
    return null
  }
}
```

Run: `npx vitest run tests/unit/lib/brand/logo-data-url.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 3: La marca cargada y las imágenes**

Create `lib/brand/load-brand.ts`:
```ts
import 'server-only'
import { getClub } from '@/lib/auth/viewer'
import { brandOf } from '@/lib/domain/club-brand'
import { clubLogoUrl } from '@/lib/domain/club-logo'
import { clubTheme, type Tokens } from '@/lib/domain/club-theme'
import { getSupabaseEnv } from '@/lib/supabase/env'
import { logoDataUrl } from './logo-data-url'

// What the icon and the share previews draw: the club's name, its dark palette and its logo, if it can be drawn.
export type LoadedBrand = { name: string; colors: Tokens; logo: string | null }

export async function loadBrand(): Promise<LoadedBrand> {
  const club = await getClub()
  return {
    name: club.name,
    colors: clubTheme(brandOf(club)).dark,
    logo: await logoDataUrl(clubLogoUrl(getSupabaseEnv().url, club.logo_path)),
  }
}
```

Create `lib/brand/brand-images.tsx`:
```tsx
import { ImageResponse } from 'next/og'
import { clubInitials } from '@/lib/domain/club-brand'
import type { SharePreview } from '@/lib/domain/share-preview'
import type { LoadedBrand } from './load-brand'

const PREVIEW_SIZE = { width: 1200, height: 630 }

// The logo on the club's background, or the initials on its primary color. ImageResponse only knows flexbox and
// inline styles.
function Mark({ brand, size }: { brand: LoadedBrand; size: number }) {
  const { colors, logo, name } = brand
  if (logo) {
    return (
      <div style={{ display: 'flex', width: size, height: size, alignItems: 'center', justifyContent: 'center', background: colors.bg, borderRadius: size * 0.2 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse draws plain img only */}
        <img src={logo} alt={name} width={size * 0.8} height={size * 0.8} style={{ objectFit: 'contain' }} />
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', width: size, height: size, alignItems: 'center', justifyContent: 'center', background: colors.accent, color: colors['on-accent'], borderRadius: size / 2, fontSize: size * 0.42, fontWeight: 700 }}>
      {clubInitials(name)}
    </div>
  )
}

// app/icon.tsx and app/apple-icon.tsx: the mark filling the square, on the club's background.
export function iconImage(brand: LoadedBrand, size: number): ImageResponse {
  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', background: brand.colors.bg }}>
        <Mark brand={brand} size={size} />
      </div>
    ),
    { width: size, height: size },
  )
}

// The opengraph-image of every page: the mark, the title and a line under it, on the club's background.
export function previewImage(brand: LoadedBrand, preview: SharePreview): ImageResponse {
  const { colors } = brand
  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', gap: 64, padding: 80, background: colors.bg, borderBottom: `24px solid ${colors.accent}` }}>
        <Mark brand={brand} size={240} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 24 }}>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1, color: colors.fg }}>{preview.title}</div>
          <div style={{ fontSize: 36, color: colors['fg-muted'] }}>{preview.description}</div>
        </div>
      </div>
    ),
    PREVIEW_SIZE,
  )
}
```

- [ ] **Step 4: Los archivos de metadata**

Run: `git rm app/icon.svg`

Create `app/icon.tsx`:
```tsx
import { iconImage } from '@/lib/brand/brand-images'
import { loadBrand } from '@/lib/brand/load-brand'

// The tab and the installed app: the club's logo on its background, or its initials on its primary color.
// It reads the club on every request (getClub uses the session cookies), so a new logo shows without a deploy.
export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default async function Icon() {
  return iconImage(await loadBrand(), size.width)
}
```

Create `app/apple-icon.tsx`:
```tsx
import { iconImage } from '@/lib/brand/brand-images'
import { loadBrand } from '@/lib/brand/load-brand'

// "Agregar a inicio" on an iPhone: the same mark as app/icon.tsx, at Apple's size.
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default async function AppleIcon() {
  return iconImage(await loadBrand(), size.width)
}
```

Create `app/manifest.ts`:
```ts
import type { MetadataRoute } from 'next'
import { getClub } from '@/lib/auth/viewer'
import { brandOf, webManifest } from '@/lib/domain/club-brand'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const club = await getClub()
  return webManifest(club.name, brandOf(club))
}
```

Create `app/opengraph-image.tsx`:
```tsx
import { previewImage } from '@/lib/brand/brand-images'
import { loadBrand } from '@/lib/brand/load-brand'
import { clubPreview } from '@/lib/domain/share-preview'

// What WhatsApp shows for any link of the app without a preview of its own: the club.
export const alt = 'Vista previa del club'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const brand = await loadBrand()
  return previewImage(brand, clubPreview(brand.name))
}
```

- [ ] **Step 5: Typecheck, lint y commit**

Run:
```bash
npm run typecheck
npm run lint
```
Expected: sin errores.

```bash
git add lib/brand app/icon.tsx app/apple-icon.tsx app/manifest.ts app/opengraph-image.tsx tests/unit/lib/brand/logo-data-url.test.ts
git commit -m "feat(marca): icon, apple icon, manifest and share preview in the club's colors"
```
(`git rm` ya dejó el borrado de `app/icon.svg` en el índice.)

---

### Task 16: Vista previa del campeonato y del partido abierto

**Files:**
- Create: `lib/data/share-preview.ts`
- Create: `app/c/[code]/opengraph-image.tsx`
- Create: `app/api/vista-previa/partido/[id]/route.tsx`
- Modify: `lib/data/championship-fixture.ts` (`loadPublicChampionship` con `cache`)
- Modify: `app/c/[code]/page.tsx`, `app/(jugador)/partidos/[id]/page.tsx`, `app/auth/ingreso/page.tsx`
- Modify: `tests/e2e/open-match.spec.ts:25`

- [ ] **Step 1: El campeonato se lee una vez por pedido**

In `lib/data/championship-fixture.ts`, replace:
```ts
import 'server-only'
```
with:
```ts
import 'server-only'
import { cache } from 'react'
```
and replace:
```ts
export async function loadPublicChampionship(code: string): Promise<PublicChampionship | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('public_championship', { p_code: code })
  if (error) throw error
  return readPublicChampionship(data)
}
```
with:
```ts
// Cached per request: the page, its metadata and its preview image read it once.
export const loadPublicChampionship = cache(async (code: string): Promise<PublicChampionship | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('public_championship', { p_code: code })
  if (error) throw error
  return readPublicChampionship(data)
})
```

- [ ] **Step 2: El campeonato**

In `app/c/[code]/page.tsx`, replace:
```tsx
import { CHAMPIONSHIP_STATUS_LABELS, datesText, matchRulesText } from '@/lib/domain/championships'
```
with:
```tsx
import { CHAMPIONSHIP_STATUS_LABELS, datesText, matchRulesText } from '@/lib/domain/championships'
import { championshipPreview } from '@/lib/domain/share-preview'
```
and replace:
```tsx
export const metadata: Metadata = { title: 'Campeonato en vivo' }

type Params = Promise<{ code: string }>
```
with:
```tsx
type Params = Promise<{ code: string }>

// WhatsApp's preview of the link: the championship's name and dates (the image is ./opengraph-image.tsx).
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { code } = await params
  const data = isPublicCode(code) ? await loadPublicChampionship(code) : null
  if (!data) return { title: 'Campeonato en vivo' }
  const preview = championshipPreview(data.championship)
  return { title: preview.title, description: preview.description, openGraph: preview }
}
```

Create `app/c/[code]/opengraph-image.tsx`:
```tsx
import { previewImage } from '@/lib/brand/brand-images'
import { loadBrand } from '@/lib/brand/load-brand'
import { loadPublicChampionship } from '@/lib/data/championship-fixture'
import { isPublicCode } from '@/lib/domain/championship-public'
import { championshipPreview, clubPreview } from '@/lib/domain/share-preview'

// A shared championship: its name and dates on the club's colors.
export const alt = 'Campeonato'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const [brand, data] = await Promise.all([loadBrand(), isPublicCode(code) ? loadPublicChampionship(code) : null])
  return previewImage(brand, data ? championshipPreview(data.championship) : clubPreview(brand.name))
}
```

- [ ] **Step 3: El partido abierto**

Create `lib/data/share-preview.ts`:
```ts
import 'server-only'
import type { Metadata } from 'next'
import { cache } from 'react'
import { getClub } from '@/lib/auth/viewer'
import { isUuid } from '@/lib/domain/input'
import { matchPreview, readMatchPreview, type SharePreview } from '@/lib/domain/share-preview'
import { createClient } from '@/lib/supabase/server'

// "Falta 1 de revés · jue 20:00" for a match still forming; null for anything else (match_preview, anon too).
export const loadMatchPreview = cache(async (matchId: string): Promise<SharePreview | null> => {
  if (!isUuid(matchId)) return null
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('match_preview', { p_match_id: matchId })
  if (error) throw error
  const preview = readMatchPreview(data)
  if (!preview) return null
  const club = await getClub()
  return matchPreview(preview, club.name, club.timezone)
})

// The title and the image WhatsApp shows for /partidos/<id>, on that page and on the sign-in page it sends a
// visitor without a session to (WhatsApp follows the redirect).
export async function matchPreviewMetadata(matchId: string): Promise<Metadata | null> {
  const preview = await loadMatchPreview(matchId)
  if (!preview) return null
  return {
    title: preview.title,
    description: preview.description,
    openGraph: { ...preview, images: [`/api/vista-previa/partido/${matchId}`] },
  }
}
```

Create `app/api/vista-previa/partido/[id]/route.tsx`:
```tsx
import { previewImage } from '@/lib/brand/brand-images'
import { loadBrand } from '@/lib/brand/load-brand'
import { loadMatchPreview } from '@/lib/data/share-preview'
import { clubPreview } from '@/lib/domain/share-preview'

// The image of a shared open match: "Falta 1 de revés · jue 20:00" on the club's colors; the club alone once it
// filled up. A route of its own and not an opengraph-image file: under the (jugador) group that file's URL carries a
// hash, and the sign-in page has to point at it too.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [brand, preview] = await Promise.all([loadBrand(), loadMatchPreview(id)])
  return previewImage(brand, preview ?? clubPreview(brand.name))
}
```

In `app/(jugador)/partidos/[id]/page.tsx`, replace:
```tsx
import { loadFreeCourts, loadMatch, loadPlayerContext, loadSuggestions } from '@/lib/data/matches'
```
with:
```tsx
import { loadFreeCourts, loadMatch, loadPlayerContext, loadSuggestions } from '@/lib/data/matches'
import { matchPreviewMetadata } from '@/lib/data/share-preview'
```
and replace:
```tsx
export const metadata: Metadata = { title: 'Partido' }

type Params = Promise<{ id: string }>
type SearchParams = Promise<{ sumarme?: string }>
```
with:
```tsx
type Params = Promise<{ id: string }>
type SearchParams = Promise<{ sumarme?: string }>

// WhatsApp's preview of a shared match: what is missing, the day and the time (never names).
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params
  return (await matchPreviewMetadata(id)) ?? { title: 'Partido' }
}
```

In `app/auth/ingreso/page.tsx`, replace:
```tsx
import { getClub } from '@/lib/auth/viewer'
```
with:
```tsx
import { getClub } from '@/lib/auth/viewer'
import { matchPreviewMetadata } from '@/lib/data/share-preview'
```
replace:
```tsx
export const metadata: Metadata = { title: 'Ingresar' }
```
with:
```tsx
type SearchParams = Promise<{ next?: string; error?: string }>

const MATCH_PREFIX = '/partidos/'

// A shared match link opened without a session lands here (requirePlayer): WhatsApp follows that redirect, so the
// preview of the match is given here too.
export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const path = safeNextPath((await searchParams).next)
  const matchId = path.startsWith(MATCH_PREFIX) ? path.slice(MATCH_PREFIX.length) : null
  return (matchId ? await matchPreviewMetadata(matchId) : null) ?? { title: 'Ingresar' }
}
```
and delete the now duplicated declaration further down:
```tsx
type SearchParams = Promise<{ next?: string; error?: string }>

```
(la que está entre `ERROR_MESSAGES` y `export default async function SignInPage`).

- [ ] **Step 4: El título del partido cambió**

El anunciador de rutas de Next (`#__next-route-announcer__`) lee el `<title>`, que ahora empieza con "Faltan 3: …". In `tests/e2e/open-match.spec.ts`, replace:
```ts
  await expect(page.getByText('Faltan 3: 1 de drive y 2 de revés')).toBeVisible()
```
with:
```ts
  await expect(page.getByText('Faltan 3: 1 de drive y 2 de revés', { exact: true })).toBeVisible()
```

- [ ] **Step 5: Typecheck, lint, Vitest, build y commit**

Run:
```bash
npm run typecheck
npm run lint
npm test
npm run build
```
Expected: sin errores; Vitest completo en verde (177 archivos, 974 tests en la validación); el build lista `ƒ /icon`, `ƒ /apple-icon`, `ƒ /manifest.webmanifest`, `ƒ /opengraph-image`, `ƒ /c/[code]/opengraph-image` y `ƒ /api/vista-previa/partido/[id]` como dinámicos. **`npm run build` lee `.env.local`**: para no tocar producción, correrlo con el stack local adelante (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY de npx supabase status> npm run build`; no imprimir la clave en notas ni commits).

```bash
git add lib/data/share-preview.ts lib/data/championship-fixture.ts "app/c/[code]/page.tsx" "app/c/[code]/opengraph-image.tsx" "app/api/vista-previa/partido/[id]/route.tsx" "app/(jugador)/partidos/[id]/page.tsx" app/auth/ingreso/page.tsx tests/e2e/open-match.spec.ts
git commit -m "feat(marca): WhatsApp previews for a championship and an open match"
```

---

## Corte 5: e2e y cierre

### Task 17: De punta a punta

**Files:**
- Create: `tests/e2e/club-brand.spec.ts`

- [ ] **Step 1: El spec**

Create `tests/e2e/club-brand.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test'
import { WEEKDAYS_SHORT } from '../../lib/domain/format'
import { addDays, localDateOf, weekdayOf } from '../../lib/domain/time'
import { adminClient, clubRow, createMember, signedInClient } from './support/admin'
import { signInWithMagicLink } from './support/auth'
import { createMatchAs } from './support/matches'

const accentOf = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())

// Changes Rustic's brand for a moment: it goes back to the defaults at the end, pass or fail.
test('marca del club: the admin picks a red, saves, and the grid and the public page of a championship show it', async ({ page }) => {
  test.setTimeout(180_000)
  const club = await clubRow()
  const admin = await createMember({ name: 'Admin Marca', prefix: 'brand-admin', role: 'admin' })

  // A championship with registration open and a public code (set directly: only publishing makes one).
  const staff = await signedInClient(admin)
  const created = await staff.rpc('create_championship', { p_club_id: club.id, p_name: 'Copa Marca E2E' })
  if (created.error) throw created.error
  const code = `marca-${Date.now()}`
  const coded = await adminClient()
    .from('championships')
    .update({ status: 'registration', public_code: code, registration_closes_at: new Date(Date.now() + 7 * 86_400_000).toISOString() })
    .eq('id', created.data.id)
  if (coded.error) throw coded.error

  try {
    await signInWithMagicLink(page, admin.email, '/club/ajustes')
    await expect(page.getByRole('heading', { name: 'Marca del club' })).toBeVisible()
    expect(await accentOf(page)).toBe('#FCB021')

    const primary = page.getByLabel('Color principal', { exact: true })
    await primary.fill('#e11d48')
    await expect(page.getByRole('region', { name: 'Vista previa en modo oscuro' })).toHaveAttribute('style', /--accent: ?#E11D48/)
    await page.getByRole('button', { name: 'Guardar marca' }).click()
    await expect(page.getByRole('status')).toContainText('Marca guardada.')

    await page.goto('/club/grilla')
    expect(await accentOf(page)).toBe('#E11D48')
    await page.goto(`/c/${code}`)
    await expect(page.getByRole('heading', { name: 'Copa Marca E2E' })).toBeVisible()
    expect(await accentOf(page)).toBe('#E11D48')

    const manifest = await (await page.request.get('/manifest.webmanifest')).json()
    expect(manifest).toMatchObject({ name: club.name, theme_color: '#021716' })
    const icon = await page.request.get('/icon')
    expect(icon.ok()).toBe(true)
    expect(icon.headers()['content-type']).toBe('image/png')
  } finally {
    const reset = await adminClient()
      .from('clubs')
      .update({ brand_primary: '#FCB021', brand_background: '#021716', color_mode: 'system' })
      .eq('id', club.id)
    if (reset.error) throw reset.error
  }
})

test('a shared match link shows what is missing and when, even without a session', async ({ request }) => {
  const club = await clubRow()
  const day = addDays(localDateOf(new Date(), club.timezone), 6)
  const player = await createMember({ name: 'Pablo Vista', prefix: 'brand-preview', side: 'drive' })
  const matchId = await createMatchAs(player, { day, time: '20:00', side: 'drive' })

  // WhatsApp has no session: it follows the redirect to the sign-in page and reads its tags.
  const html = await (await request.get(`/partidos/${matchId}`)).text()
  const title = `Faltan 3: 1 de drive y 2 de revés · ${WEEKDAYS_SHORT[weekdayOf(day)]} 20:00`
  expect(html).toContain(`<meta property="og:title" content="${title}"/>`)
  expect(html).toMatch(new RegExp(`<meta property="og:image" content="[^"]*/api/vista-previa/partido/${matchId}"`))
  expect(html).not.toContain('Pablo')

  const image = await request.get(`/api/vista-previa/partido/${matchId}`)
  expect(image.ok()).toBe(true)
  expect(image.headers()['content-type']).toBe('image/png')
})
```

- [ ] **Step 2: Correrlo**

Run: `npx playwright test tests/e2e/club-brand.spec.ts --workers=1`
Expected: `2 passed`.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/club-brand.spec.ts
git commit -m "test(marca): e2e, the admin's red reaches the grid and the public page; a match link preview"
```

---

### Task 18: Todo en verde y PR listo

**Files:**
- Modify: `docs/features/marca-del-club/notes.md`, `docs/features/marca-del-club/plan.md` (revisiones)

- [ ] **Step 1: Todo en verde**

Run:
```bash
npm run db:reset
npm run test:db
npm test
npm run lint
npm run typecheck
npx playwright test --workers=1
```
Expected: pgTAP 67 archivos en verde; Vitest en verde; los 14 flujos e2e en verde. Más el `build` del Step 5 de la Task 16, con el stack local adelante.

- [ ] **Step 2: Revisión de disciplina**

Run `/team-setup:discipline-check` sobre la rama y arreglar lo que encuentre en commits aparte (con su test). Si algún arreglo toca la base, va en una migración nueva `20261013000140_*.sql` con su pgTAP. Mirar en especial: que `anon` ejecute solo `public_championship` y `match_preview` (`integrity.test.sql`) y que `match_preview` no devuelva nombres; que `save_club_brand` pase por `private.has_club_role` antes de mirar los colores; que `claim_notification_emails` sea la copia exacta de `20261005000160` más las dos columnas; que ningún componente lea `brand_primary`/`brand_background` directo (solo `app/layout.tsx`, `lib/brand/load-brand.ts`, `app/manifest.ts`, Ajustes y el outbox); que `clubTheme` con los colores de Rustic siga dando la paleta de `globals.css` (lo fija `club-theme.test.ts`); y que `lib/domain` siga sin `Date.now()`.

- [ ] **Step 3: Notas de ejecución y stash**

Append to `docs/features/marca-del-club/notes.md` one dated entry per corte with the deviations from this plan, and to the "Plan revisions" section of this file a `v3` line if the plan changed during execution. Then drop the validation stash (`git stash list` → the entry `marca-del-club: plan validation …`, `git stash drop stash@{N}`).

```bash
git add docs/features/marca-del-club/notes.md docs/features/marca-del-club/plan.md
git commit -m "docs: marca del club execution notes"
git push
```

- [ ] **Step 4: PR listo**

Marcar el PR como listo desde GitHub y esperar CI en verde.
Expected: `quality` y `db-and-e2e` en verde.

- [ ] **Step 5: MANUAL (entorno de demo, después del merge)**

- MANUAL (Miguel): confirmar que `migrate.yml` aplicó `20261013000100` a `20261013000130` (`select version from supabase_migrations.schema_migrations order by version desc limit 4`).
- MANUAL: en el entorno de demo, Ajustes → "Marca del club": probar un rojo y "Siempre claro", recargar, mirar la grilla, la pestaña (ícono), "Agregar a inicio" en el celular y un mail de aviso; después "Volver a los colores originales" y guardar.
- MANUAL: pegar en WhatsApp el link de un partido abierto y el de un campeonato publicado: título, línea e imagen con los colores del club (WhatsApp cachea la vista previa de un link ya compartido: probar con uno nuevo).

---

## Acceptance criteria

- [ ] En Ajustes (solo admin), "Marca del club" tiene el color principal y el de fondo (selector y `#RRGGBB`), el modo ("Según el dispositivo", "Siempre oscuro", "Siempre claro"), una vista previa en vivo en oscuro y claro (encabezado con logo y nombre, botón principal, tarjeta con texto suave, "En juego" y una cancha con un lugar ocupado y uno que falta), el aviso de una línea cuando el cálculo corrigió algo, "Guardar marca" y "Volver a los colores originales".
- [ ] Con `#FCB021` y `#021716` la app se ve exactamente como antes; con otros colores, todo texto queda a 4.5:1 o más sobre su fondo en los dos modos, y un valor inválido cae a los de Rustic.
- [ ] Al recargar, la app, la página pública del campeonato y el modo TV toman la marca (sin parpadeo: el `<style>` viene del servidor); "Siempre oscuro" y "Siempre claro" no siguen al dispositivo.
- [ ] El ícono de la pestaña y del inicio del celular es el logo sobre el fondo del club (o las iniciales sobre el principal); el manifest lleva el nombre y el color del club.
- [ ] Un link compartido muestra en WhatsApp: el campeonato con su nombre y fechas; un partido abierto con "Falta 1 de revés · jue 20:00" (sin nombres), también sin sesión; el resto, el club.
- [ ] Los mails de avisos usan la paleta oscura del club.
- [ ] En la cancha de un partido abierto, el lugar que falta es un hueco con el fondo del club, borde punteado y "Falta" en el color principal; el ocupado sigue azul y "Sumarme" en el principal lleno.
- [ ] RLS y permisos: solo el admin del club guarda la marca (`forbidden` para recepción, jugador y admin de otro club; `invalid_color` para `#FFF`, `rojo`, `#GGGGGG`); `anon` ejecuta solo `public_championship` y `match_preview`.
- [ ] pgTAP, Vitest, lint, typecheck, build y todos los flujos e2e en verde en CI.

## Plan revisions

(append-only)

- **v1 (2026-10-13)**: initial plan.
- **v2 (2026-10-13)**: plan completo en 5 cortes (Tasks 1–18) sobre el diseño aprobado. Decisiones propias en "Decisiones que este plan toma" (`p_club_id` en `save_club_brand`, cálculo en OKLCH desde la paleta de Rustic, fondo claro bajado a L 0.30 en oscuro, `:root:root`, logo de reemplazo con tokens, `match_preview` para `anon`, imagen del partido como route handler y metadata del partido en la página de ingreso, mails en la paleta oscura). Validado antes de ejecutar: con el plan entero aplicado sobre la rama, `db reset`, pgTAP completo en verde (67 archivos, 1140 aserciones), tipos generados, typecheck y lint sin errores, Vitest completo en verde (177 archivos, 974 tests), `next build` con el stack local, y los 14 flujos e2e en verde con `--workers=1` (incluido `club-brand.spec.ts`). En la validación se corrigieron tres cosas que ya están en el plan: la imagen del partido pasó de `opengraph-image` (URL con hash bajo `(jugador)`) a `/api/vista-previa/partido/[id]`; el campeonato del e2e necesita `registration_closes_at`; y `open-match.spec.ts` busca "Faltan 3…" con `exact: true`. La implementación validada quedó en un `git stash` (ver "Antes de empezar") y el árbol volvió a `bce560f`.
