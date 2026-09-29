---
feature: fase-0-base
type: plan
status: draft
date: 2026-09-28
branch: main
references: ./design.md, ../../plan-general.md
---

# Fase 0 (base) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/team-setup:execute` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar repo, base de datos con RLS, tests y deploy conectados para que cada cambio posterior llegue a producción solo por PR.

**Architecture:** Next.js (App Router) en Vercel sin servidor propio; Supabase (Postgres + Auth) guarda los datos y las reglas. Las invariantes viven en la base: la doble reserva la impide un `EXCLUDE USING gist`, los permisos los resuelve RLS vía `club_members.role`. La sesión viaja en cookies con `@supabase/ssr`; un `proxy`/`middleware` la refresca en cada request.

**Tech Stack:** Next.js + React 19 + TypeScript + Tailwind v4, Supabase CLI 2.118 (Postgres 17 local en Docker), `@supabase/ssr`, Vitest + Testing Library, pgTAP (`supabase test db`), Playwright, GitHub Actions, Vercel.

---

## Antes de empezar

- Shell: PowerShell 7 o Git Bash. Todos los comandos del plan funcionan en ambos salvo que se indique. No usar Windows PowerShell 5.1 (no tiene `&&` y redirige en UTF-16).
- Docker Desktop tiene que estar corriendo para cualquier comando `supabase start|db reset|test db`.
- Los pasos marcados **MANUAL (usuario)** no los puede hacer un agente: necesitan cuentas, tokens o pantallas de GitHub/Supabase/Vercel/Google.
- Commits en rama `feat/fase-0-base` a partir de la Task 3. El primer commit (scaffold) va directo a `main` porque el repo está vacío y todavía no hay protección.

## Decisiones que este plan toma (y que el diseño no fijaba)

| Tema | Decisión | Por qué |
| --- | --- | --- |
| `profiles` sin `club_id` | Un perfil por usuario de Auth, global; la pertenencia a clubes va en `club_members` | Un jugador puede estar en varios clubes con la misma identidad. Es la única tabla núcleo sin `club_id` |
| `court_occupancy.club_id` | Denormalizado + FK compuesta `(court_id, club_id) → courts(id, club_id)` | RLS filtra por club sin join, y la FK impide ocupar una cancha de otro club |
| Cancelar = borrar ocupación | La restricción queda exactamente `EXCLUDE USING gist (court_id WITH =, period WITH &&)`, sin columna de estado | La ocupación representa lo que *hoy* ocupa la cancha. El historial de reservas vive en su tabla (fase 1) |
| Rango `[)` obligatorio | `CHECK` exige límites finitos, inicio incluido y fin excluido | Turnos pegados (19:00–20:30 y 20:30–22:00) no se pisan |
| Grants explícitos | Cada migración revoca y otorga permisos a `anon`/`authenticated` | No dependemos del default de Supabase de exponer tablas nuevas |
| Helpers de RLS en schema `private` | Funciones `security definer` fuera de `public` | No quedan expuestas como RPC y evitan recursión de RLS sobre `club_members` |
| Playwright en CI | Job `db-and-e2e` corre el smoke contra el stack local de Supabase | Cumple "cada fase termina con un flujo Playwright en CI" sin depender de previews de Vercel |
| `seed.sql` solo local | Producción no se siembra en fase 0 | Los datos reales de Rustic llegan como migración de datos en fase 1 |
| Previews comparten Supabase | Vercel Preview y Production apuntan al mismo proyecto | Plan gratuito; no hay usuarios reales todavía. Revisar antes del piloto |
| Secret extra | `SUPABASE_PUBLISHABLE_KEY` para el ping anti-pausa | El ping necesita una clave para consultar la API REST |

## Mapa de archivos

| Archivo | Responsabilidad |
| --- | --- |
| `.gitattributes` | Fin de línea LF en todo el repo (Windows) |
| `lib/cn.ts` | Unir clases Tailwind resolviendo conflictos |
| `lib/design/contrast.ts` | Contraste WCAG entre dos colores hex |
| `lib/auth/redirect.ts` | `safeNextPath` (anti open-redirect) y `getSiteUrl` |
| `lib/supabase/env.ts` | Leer y validar variables públicas de Supabase |
| `lib/supabase/client.ts` | Cliente de navegador |
| `lib/supabase/server.ts` | Cliente de servidor (cookies) |
| `lib/supabase/proxy.ts` | `updateSession` para refrescar sesión en cada request |
| `lib/supabase/database.types.ts` | Tipos generados por `supabase gen types` |
| `proxy.ts` (o `middleware.ts` en Next 15) | Engancha `updateSession` |
| `app/globals.css` | Tokens Rustic (variables CSS + `@theme`) |
| `app/layout.tsx` | Fuentes, metadata, tema |
| `app/icon.svg`, `components/brand/logo.tsx` | Logo placeholder |
| `components/ui/{button,card,bottom-sheet}.tsx` | Componentes base |
| `app/page.tsx` | Inicio mínimo |
| `app/auth/ingreso/{page,actions,magic-link-form}.tsx` | Ingreso por enlace mágico y Google |
| `app/auth/callback/route.ts` | Canje de código por sesión |
| `supabase/config.toml` | Config local (URLs de auth, rate limit) |
| `supabase/migrations/20260928000100_core_tables.sql` | `clubs`, `courts`, `profiles`, `club_members`, trigger de perfil |
| `supabase/migrations/20260928000200_court_occupancy.sql` | Ocupaciones + exclusion constraint |
| `supabase/migrations/20260928000300_rls_policies.sql` | Grants, helpers y políticas RLS |
| `supabase/seed.sql` | Rustic + canchas placeholder |
| `supabase/tests/database/*.test.sql` | pgTAP |
| `tests/unit/**` | Vitest |
| `tests/e2e/smoke.spec.ts` | Playwright |
| `vitest.config.mts`, `playwright.config.ts` | Config de tests |
| `.github/workflows/{ci,migrate,backup,keepalive}.yml` | CI/CD |

Las carpetas `app/(jugador)` y `app/(club)` del plan general no se crean todavía: git no versiona carpetas vacías y no hay pantallas en esta fase.

---

### Task 1: Verificar herramientas

**Files:** ninguno. `# (sin test — verificación de entorno)`

- [ ] **Step 1: Confirmar versiones y Docker**

Run:
```bash
node --version
npm --version
supabase --version
docker info --format "{{.ServerVersion}}"
git remote -v
```
Expected: `v22.14.x`, `10.9.x`, `2.118.x`, una versión de Docker (si falla, abrir Docker Desktop y reintentar), y `origin` apuntando a `github.com/mmonroy1686/padel-management`.

- [ ] **Step 2: Anotar la versión exacta del CLI**

Guardar el valor exacto de `supabase --version` (ej. `2.118.0`). Se usa para fijar la versión en los workflows (Tasks 23–25). Si CI y local usan versiones distintas, `supabase gen types` puede generar salida distinta y el chequeo de tipos falla.

---

### Task 2: Scaffold de Next.js y primer commit en `main`

**Files:**
- Create: `.gitattributes`
- Create (scaffold): `package.json`, `app/`, `public/`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `.gitignore`, `README.md`
- Modify: `.gitignore`, `package.json` (scripts), `eslint.config.mjs`

`# (sin test — scaffold)`

- [ ] **Step 1: Crear `.gitattributes`**

```gitattributes
* text=auto eol=lf
*.png binary
*.jpg binary
*.ico binary
*.woff2 binary
```

- [ ] **Step 2: Correr create-next-app en la raíz**

Run:
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --yes
```
Expected: instala dependencias y termina con `Success! Created padel-management`. `docs/` está en la lista de archivos que create-next-app tolera.

Si igual se queja de que la carpeta no está vacía: mover `docs` afuera, correr el comando y volver a moverla.
```bash
mv docs ../padel-docs-tmp
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --yes
mv ../padel-docs-tmp docs
```

- [ ] **Step 3: Ver qué versión de Next quedó**

Run: `npx next --version`
Expected: `Next.js v16.x` o `v15.x`. Anotarlo: define si la Task 13 crea `proxy.ts` (16+) o `middleware.ts` (15).

- [ ] **Step 4: Ajustar `.gitignore`**

Agregar al final (el template ignora `.env*`, y queremos versionar el ejemplo):

```gitignore
# Keep the env template
!.env.example

# Playwright
/test-results/
/playwright-report/
/blob-report/
/playwright/.cache/
```

- [ ] **Step 5: Scripts de `package.json`**

Reemplazar el bloque `"scripts"` completo por:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:db": "supabase test db",
  "test:e2e": "playwright test",
  "db:reset": "supabase db reset",
  "db:types": "supabase gen types typescript --local --schema public > lib/supabase/database.types.ts"
}
```

`db:types` se corre siempre vía npm (en Windows usa `cmd.exe`, que redirige bytes tal cual). No redirigir a mano en Windows PowerShell 5.1: escribe UTF-16 y rompe el diff de CI.

- [ ] **Step 6: Ignorar reportes en ESLint**

En `eslint.config.mjs`, sumar estos patrones a la lista de ignorados existente (en Next 16 es el array de `globalIgnores([...])`; en Next 15, un objeto `{ ignores: [...] }` al final del array exportado):

```js
"playwright-report/**",
"test-results/**",
"blob-report/**",
```

- [ ] **Step 7: Verificar que arranca y pasa lint/typecheck**

Run:
```bash
npm run lint
npm run typecheck
npm run dev
```
Expected: lint y typecheck sin errores; `http://localhost:3000` muestra la página por defecto de Next. Cortar el dev server con Ctrl+C.

- [ ] **Step 8: Primer commit y push a `main`**

```bash
git add -A
git commit -m "chore: scaffold Next.js app and project docs"
git push -u origin main
```
Expected: push OK. Si pide credenciales de GitHub, las ingresa el usuario.

---

### Task 3: Rama de trabajo

`# (sin test — git)`

- [ ] **Step 1: Crear la rama**

```bash
git switch -c feat/fase-0-base
```
Expected: `Switched to a new branch 'feat/fase-0-base'`. Todo lo que sigue se commitea acá.

---

### Task 4: Vitest y `cn`

**Files:**
- Create: `vitest.config.mts`
- Create: `tests/unit/setup.ts`
- Create: `lib/cn.ts`
- Test: `tests/unit/lib/cn.test.ts`

- [ ] **Step 1: Instalar dependencias de test y utilidades**

```bash
npm i tailwind-merge
npm i -D vitest @vitejs/plugin-react vite-tsconfig-paths jsdom @testing-library/react @testing-library/dom @testing-library/user-event @testing-library/jest-dom
```

- [ ] **Step 2: Configurar Vitest**

`vitest.config.mts`:
```ts
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/unit/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
})
```

`tests/unit/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})
```

- [ ] **Step 3: Stub de `cn`**

`lib/cn.ts`:
```ts
import type { ClassNameValue } from 'tailwind-merge'

export function cn(...classes: ClassNameValue[]): string {
  void classes
  throw new Error('not implemented')
}
```

- [ ] **Step 4: Escribir el test que falla**

`tests/unit/lib/cn.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { cn } from '@/lib/cn'

describe('cn', () => {
  it('joins classes and drops falsy values', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b')
  })

  it('lets the later Tailwind class win when two conflict', () => {
    expect(cn('p-4 text-fg', 'p-6')).toBe('text-fg p-6')
  })
})
```

- [ ] **Step 5: Correr y ver que falla**

Run: `npm test -- tests/unit/lib/cn.test.ts`
Expected: FAIL con `Error: not implemented`.

- [ ] **Step 6: Implementar**

`lib/cn.ts`:
```ts
import { twMerge, type ClassNameValue } from 'tailwind-merge'

export function cn(...classes: ClassNameValue[]): string {
  return twMerge(classes)
}
```

- [ ] **Step 7: Correr y ver que pasa**

Run: `npm test`
Expected: PASS, 2 tests.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.mts tests/unit lib/cn.ts
git commit -m "test: set up Vitest and add cn helper"
```

---

### Task 5: Contraste WCAG

**Files:**
- Create: `lib/design/contrast.ts`
- Test: `tests/unit/lib/design/contrast.test.ts`

- [ ] **Step 1: Stub**

`lib/design/contrast.ts`:
```ts
export function relativeLuminance(hex: string): number {
  void hex
  throw new Error('not implemented')
}

export function contrastRatio(foreground: string, background: string): number {
  void foreground
  void background
  throw new Error('not implemented')
}
```

- [ ] **Step 2: Test que falla**

`tests/unit/lib/design/contrast.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/design/contrast'

describe('contrastRatio', () => {
  it('returns 21 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
  })

  it('gives the same result in both directions', () => {
    expect(contrastRatio('#FCB021', '#021716')).toBeCloseTo(contrastRatio('#021716', '#FCB021'), 10)
  })

  it('matches the Rustic pairs measured in the general plan', () => {
    expect(contrastRatio('#000000', '#FCB021')).toBeCloseTo(11.4, 0)
    expect(contrastRatio('#FFFFFF', '#021716')).toBeCloseTo(18.5, 0)
    expect(contrastRatio('#8A5A00', '#FFFFFF')).toBeCloseTo(5.9, 0)
  })

  it('accepts shorthand hex', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 5)
  })

  it('rejects values that are not hex colors', () => {
    expect(() => contrastRatio('red', '#000')).toThrow(/hex/)
  })
})
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npm test -- tests/unit/lib/design/contrast.test.ts`
Expected: FAIL con `Error: not implemented`.

- [ ] **Step 4: Implementar**

`lib/design/contrast.ts`:
```ts
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

function linearize(channel: number): number {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex: string): number {
  const match = HEX_COLOR.exec(hex)
  if (!match) throw new Error(`Not a hex color: ${hex}`)

  const digits = match[1].length === 3
    ? match[1].split('').map((digit) => digit + digit).join('')
    : match[1]
  const [r, g, b] = [0, 2, 4].map((start) => parseInt(digits.slice(start, start + 2), 16))

  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

export function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)]
    .sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `npm test`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/design tests/unit/lib/design
git commit -m "feat: add WCAG contrast helper"
```

---

### Task 6: Supabase local

**Files:**
- Create: `supabase/config.toml`, `supabase/.gitignore` (vía CLI)
- Modify: `supabase/config.toml`

`# (sin test — config; los pgTAP de las Tasks 7–9 lo ejercitan)`

- [ ] **Step 1: Inicializar**

Run: `supabase init`
Expected: crea `supabase/config.toml`. A las preguntas de settings de Deno para VS Code / IntelliJ, responder `N`.

- [ ] **Step 2: Ajustar auth en `supabase/config.toml`**

En la sección `[auth]`, dejar:
```toml
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/**"]
```

En la sección `[auth.rate_limit]`, dejar:
```toml
email_sent = 100
```

Usamos `localhost` (no `127.0.0.1`) en todos lados: la cookie del flujo PKCE queda atada al host, y si el enlace del email vuelve a otro host el canje falla. Playwright también usa `localhost`.

Confirmar que `[db] major_version = 17` (es lo que crea hoy un proyecto nuevo en Supabase; se valida en la Task 28).

- [ ] **Step 3: Levantar el stack**

Run: `supabase start`
Expected: la primera vez baja imágenes (varios minutos). Termina mostrando `API URL: http://127.0.0.1:54321`, `DB URL`, `Studio URL`, `Mailpit URL: http://127.0.0.1:54324` (en versiones viejas figura como Inbucket) y las claves (`Publishable key` y/o `anon key`).

- [ ] **Step 4: Commit**

```bash
git add supabase/config.toml supabase/.gitignore
git commit -m "chore: initialize local Supabase"
```

---

### Task 7: Tablas núcleo (`clubs`, `courts`, `profiles`, `club_members`)

**Files:**
- Create: `supabase/migrations/20260928000100_core_tables.sql`
- Test: `supabase/tests/database/schema.test.sql`

- [ ] **Step 1: Test pgTAP que falla**

`supabase/tests/database/schema.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select has_extension('extensions', 'btree_gist', 'btree_gist is installed for the occupancy constraint');
select has_table('public', 'clubs', 'clubs exists');
select has_table('public', 'courts', 'courts exists');
select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'club_members', 'club_members exists');

select is_empty(
  $$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  $$,
  'every table in public has RLS enabled'
);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'lucia@test.local', '{"full_name": "Lucía Gómez"}'),
  ('00000000-0000-0000-0000-0000000000f2', 'mateo@test.local', '{}');

select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000f1'),
  'Lucía Gómez',
  'new user gets a profile named after the provider full name'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000f2'),
  'mateo',
  'without a full name the profile falls back to the email user'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Correr y ver que falla**

Run: `supabase test db`
Expected: FAIL en `schema.test.sql` (`has_table` no ok y error en el insert porque `public.profiles` no existe).

- [ ] **Step 3: Migración**

`supabase/migrations/20260928000100_core_tables.sql`:
```sql
-- Core tables. Every domain table carries club_id, except profiles:
-- a profile belongs to the person, and club membership lives in club_members.

create extension if not exists btree_gist with schema extensions;

create schema if not exists private;

create type public.club_role as enum ('admin', 'reception', 'player');
create type public.player_side as enum ('drive', 'backhand', 'both');
create type public.dominant_hand as enum ('right', 'left');

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) > 0),
  timezone text not null default 'America/Montevideo',
  cancellation_notice_hours smallint not null default 24 check (cancellation_notice_hours >= 0),
  created_at timestamptz not null default now()
);
alter table public.clubs enable row level security;

create table public.courts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  is_covered boolean not null default false,
  is_active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (club_id, name),
  -- Target for the composite FK in court_occupancy: an occupancy can only
  -- point at a court of its own club.
  unique (id, club_id)
);
alter table public.courts enable row level security;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  side public.player_side,
  hand public.dominant_hand,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create table public.club_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.club_role not null default 'player',
  category smallint check (category between 1 and 8),
  category_validated boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index club_members_user_id_idx on public.club_members (user_id);
alter table public.club_members enable row level security;

-- Every Auth user gets a profile. Google sends full_name; magic link does not,
-- so we fall back to the part of the email before the @.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(new.email, '@', 1),
      'Jugador'
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
```

- [ ] **Step 4: Aplicar y correr**

Run:
```bash
supabase db reset
supabase test db
```
Expected: `db reset` aplica la migración (avisa que no encuentra `seed.sql`, está bien por ahora). `schema.test.sql .. ok`, `All tests successful`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260928000100_core_tables.sql supabase/tests/database/schema.test.sql
git commit -m "feat(db): add core tables and profile trigger"
```

---

### Task 8: `court_occupancy` y la doble reserva imposible

**Files:**
- Create: `supabase/migrations/20260928000200_court_occupancy.sql`
- Test: `supabase/tests/database/occupancy.test.sql`

- [ ] **Step 1: Test pgTAP que falla**

`supabase/tests/database/occupancy.test.sql` (corre como `postgres`, sin RLS: prueba solo las restricciones):
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.clubs (id, slug, name) values
  ('a0000000-0000-0000-0000-000000000001', 'test-club-a', 'Club A'),
  ('a0000000-0000-0000-0000-000000000002', 'test-club-b', 'Club B');

insert into public.courts (id, club_id, name) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Cancha 1'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Cancha 2'),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'Cancha 1');

select has_table('public', 'court_occupancy', 'court_occupancy exists');

select lives_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'booking',
             tstzrange('2026-10-01 19:00-03', '2026-10-01 20:30-03')) $$,
  'books a free slot'
);

select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'block',
             tstzrange('2026-10-01 20:00-03', '2026-10-01 21:30-03')) $$,
  '23P01', null,
  'rejects any overlapping occupancy on the same court, whatever its kind'
);

select lives_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'booking',
             tstzrange('2026-10-01 20:30-03', '2026-10-01 22:00-03')) $$,
  'allows back-to-back slots'
);

select lives_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'booking',
             tstzrange('2026-10-01 19:00-03', '2026-10-01 20:30-03')) $$,
  'allows the same time on another court'
);

select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'booking',
             tstzrange('2026-10-02 19:00-03', '2026-10-02 20:30-03')) $$,
  '23503', null,
  'rejects a court that belongs to another club'
);

select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'booking',
             tstzrange('2026-10-02 19:00-03', '2026-10-02 19:00-03')) $$,
  '23514', null,
  'rejects an empty period'
);

select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'block',
             tstzrange('2026-10-02 19:00-03', null)) $$,
  '23514', null,
  'rejects an open-ended period'
);

select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'booking',
             tstzrange('2026-10-03 19:00-03', '2026-10-03 20:30-03', '[]')) $$,
  '23514', null,
  'rejects closed ranges so the end of one slot is free for the next'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Correr y ver que falla**

Run: `supabase test db`
Expected: FAIL en `occupancy.test.sql` (`court_occupancy` no existe). `schema.test.sql` sigue ok.

- [ ] **Step 3: Migración**

`supabase/migrations/20260928000200_court_occupancy.sql`:
```sql
-- Anything that takes a court: booking, recurring slot, tournament, block,
-- open match, day use. The database, not the app, makes double booking impossible.
-- Cancelling means deleting the occupancy; history lives in each feature's own table.

create type public.occupancy_kind as enum ('booking', 'recurring', 'tournament', 'block', 'match', 'day_use');

create table public.court_occupancy (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  court_id uuid not null,
  kind public.occupancy_kind not null,
  period tstzrange not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint court_occupancy_court_in_club
    foreign key (court_id, club_id) references public.courts (id, club_id) on delete cascade,
  -- Finite, non-empty, start included and end excluded: 19:00-20:30 and 20:30-22:00 do not overlap.
  constraint court_occupancy_period_shape check (
    not isempty(period)
    and not lower_inf(period)
    and not upper_inf(period)
    and lower_inc(period)
    and not upper_inc(period)
  ),
  constraint court_occupancy_no_overlap
    exclude using gist (court_id with =, period with &&)
);

create index court_occupancy_club_period_idx on public.court_occupancy using gist (club_id, period);

alter table public.court_occupancy enable row level security;
```

- [ ] **Step 4: Aplicar y correr**

Run:
```bash
supabase db reset
supabase test db
```
Expected: `schema.test.sql .. ok`, `occupancy.test.sql .. ok`, `All tests successful`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260928000200_court_occupancy.sql supabase/tests/database/occupancy.test.sql
git commit -m "feat(db): add court_occupancy with exclusion constraint"
```

---

### Task 9: RLS y permisos

**Files:**
- Create: `supabase/migrations/20260928000300_rls_policies.sql`
- Test: `supabase/tests/database/rls.test.sql`

Matriz que implementamos:

| Tabla | anon | Jugador | Recepción | Admin |
| --- | --- | --- | --- | --- |
| `clubs` | lee | lee | lee | lee, edita su club |
| `courts` | lee | lee | lee | lee, crea/edita/borra en su club |
| `profiles` | — | lee el suyo y los públicos; edita el suyo | + privados de miembros de su club | igual que recepción |
| `club_members` | — | ve su fila; se suma como `player` sin validar | ve todo su club | ve y gestiona todo su club |
| `court_occupancy` | — | ve su club; crea/borra *sus* `booking` | ve, crea, edita, borra en su club | igual que recepción |

- [ ] **Step 1: Test pgTAP que falla**

`supabase/tests/database/rls.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
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
   'booking', tstzrange('2026-10-01 19:00-03', '2026-10-01 20:30-03'), '00000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
   'booking', tstzrange('2026-10-01 19:00-03', '2026-10-01 20:30-03'), '00000000-0000-0000-0000-0000000000d1');

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

select lives_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'booking',
             tstzrange('2026-10-01 21:00-03', '2026-10-01 22:30-03'), '00000000-0000-0000-0000-0000000000a1') $$,
  'player books for themselves');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'booking',
             tstzrange('2026-10-01 23:00-03', '2026-10-02 00:30-03'), '00000000-0000-0000-0000-0000000000b1') $$,
  '42501', null, 'player cannot book in someone else''s name');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'block',
             tstzrange('2026-10-02 08:00-03', '2026-10-02 09:00-03'), '00000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'player cannot block a court');
select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'booking',
             tstzrange('2026-10-02 19:00-03', '2026-10-02 20:30-03'), '00000000-0000-0000-0000-0000000000a1') $$,
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

delete from public.court_occupancy where id = 'e0000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'booking',
             tstzrange('2026-10-01 21:30-03', '2026-10-01 22:00-03'), '00000000-0000-0000-0000-0000000000b1') $$,
  '23P01', null, 'double booking fails across players');

-- Carla, reception in club X
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select is((select count(*)::int from public.club_members where club_id = 'a0000000-0000-0000-0000-000000000001'), 3,
  'reception sees every member of their club');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'), 1,
  'reception reads private profiles of their club members');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'), 0,
  'reception cannot read private profiles outside their club');
select lives_ok(
  $$ insert into public.court_occupancy (club_id, court_id, kind, period, created_by)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'block',
             tstzrange('2026-10-02 08:00-03', '2026-10-02 09:00-03'), '00000000-0000-0000-0000-0000000000c1') $$,
  'reception can block a court');

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

- [ ] **Step 2: Correr y ver que falla**

Run: `supabase test db`
Expected: FAIL en `rls.test.sql` (sin políticas: `anon can read courts` da 0, `player reads own profile` da 0, etc.).

- [ ] **Step 3: Migración**

`supabase/migrations/20260928000300_rls_policies.sql`:
```sql
-- Permissions. We revoke first so we never depend on Supabase's default
-- grants, then grant exactly what each role may attempt. RLS narrows it to rows.

revoke all on public.clubs, public.courts, public.profiles, public.club_members, public.court_occupancy
  from anon, authenticated;

grant select on public.clubs, public.courts to anon, authenticated;
grant update on public.clubs to authenticated;
grant insert, update, delete on public.courts to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.club_members to authenticated;
grant select, insert, update, delete on public.court_occupancy to authenticated;

-- Helpers. security definer so they read club_members without going through
-- its own RLS (that would recurse). They live in private, which the API does not expose.

create function private.is_club_member(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.club_members m
    where m.club_id = p_club_id and m.user_id = (select auth.uid())
  );
$$;

create function private.has_club_role(p_club_id uuid, p_roles public.club_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.club_members m
    where m.club_id = p_club_id
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
  );
$$;

-- True when the caller is admin or reception in a club where p_user_id is a member.
create function private.is_staff_of_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.club_members staff
    join public.club_members target on target.club_id = staff.club_id
    where staff.user_id = (select auth.uid())
      and staff.role in ('admin', 'reception')
      and target.user_id = p_user_id
  );
$$;

revoke all on function private.is_club_member(uuid) from public;
revoke all on function private.has_club_role(uuid, public.club_role[]) from public;
revoke all on function private.is_staff_of_user(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_club_member(uuid) to authenticated;
grant execute on function private.has_club_role(uuid, public.club_role[]) to authenticated;
grant execute on function private.is_staff_of_user(uuid) to authenticated;

-- clubs
create policy clubs_select_all on public.clubs
  for select to anon, authenticated using (true);
create policy clubs_update_admin on public.clubs
  for update to authenticated
  using (private.has_club_role(id, array['admin']::public.club_role[]))
  with check (private.has_club_role(id, array['admin']::public.club_role[]));

-- courts
create policy courts_select_all on public.courts
  for select to anon, authenticated using (true);
create policy courts_insert_admin on public.courts
  for insert to authenticated
  with check (private.has_club_role(club_id, array['admin']::public.club_role[]));
create policy courts_update_admin on public.courts
  for update to authenticated
  using (private.has_club_role(club_id, array['admin']::public.club_role[]))
  with check (private.has_club_role(club_id, array['admin']::public.club_role[]));
create policy courts_delete_admin on public.courts
  for delete to authenticated
  using (private.has_club_role(club_id, array['admin']::public.club_role[]));

-- profiles (created only by the auth trigger, so there is no insert policy)
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or is_public or private.is_staff_of_user(id));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- club_members
create policy club_members_select on public.club_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_club_role(club_id, array['admin', 'reception']::public.club_role[])
  );
create policy club_members_insert_self_as_player on public.club_members
  for insert to authenticated
  with check (user_id = (select auth.uid()) and role = 'player' and not category_validated);
create policy club_members_insert_admin on public.club_members
  for insert to authenticated
  with check (private.has_club_role(club_id, array['admin']::public.club_role[]));
create policy club_members_update_admin on public.club_members
  for update to authenticated
  using (private.has_club_role(club_id, array['admin']::public.club_role[]))
  with check (private.has_club_role(club_id, array['admin']::public.club_role[]));
create policy club_members_delete_admin on public.club_members
  for delete to authenticated
  using (private.has_club_role(club_id, array['admin']::public.club_role[]));

-- court_occupancy
create policy court_occupancy_select_members on public.court_occupancy
  for select to authenticated
  using (private.is_club_member(club_id));
create policy court_occupancy_insert_staff on public.court_occupancy
  for insert to authenticated
  with check (private.has_club_role(club_id, array['admin', 'reception']::public.club_role[]));
create policy court_occupancy_insert_own_booking on public.court_occupancy
  for insert to authenticated
  with check (
    kind = 'booking'
    and created_by = (select auth.uid())
    and private.is_club_member(club_id)
  );
create policy court_occupancy_update_staff on public.court_occupancy
  for update to authenticated
  using (private.has_club_role(club_id, array['admin', 'reception']::public.club_role[]))
  with check (private.has_club_role(club_id, array['admin', 'reception']::public.club_role[]));
create policy court_occupancy_delete_staff_or_own_booking on public.court_occupancy
  for delete to authenticated
  using (
    private.has_club_role(club_id, array['admin', 'reception']::public.club_role[])
    or (kind = 'booking' and created_by = (select auth.uid()))
  );
```

- [ ] **Step 4: Aplicar y correr**

Run:
```bash
supabase db reset
supabase test db
```
Expected: `schema.test.sql .. ok`, `occupancy.test.sql .. ok`, `rls.test.sql .. ok`, `All tests successful`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260928000300_rls_policies.sql supabase/tests/database/rls.test.sql
git commit -m "feat(db): add grants and RLS policies with pgTAP coverage"
```

---

### Task 10: Seed y tipos generados

**Files:**
- Create: `supabase/seed.sql`
- Create: `lib/supabase/database.types.ts` (generado)

`# (sin test — datos de ejemplo; el diff de tipos lo controla CI en la Task 23)`

- [ ] **Step 1: `seed.sql` placeholder**

`supabase/seed.sql`:
```sql
-- Local data only (supabase start / db reset). Production is not seeded.
-- Placeholder until Rustic sends its real courts and opening hours.
insert into public.clubs (id, slug, name, timezone, cancellation_notice_hours) values
  ('11111111-1111-1111-1111-111111111111', 'rustic', 'Rustic Pádel', 'America/Montevideo', 24)
on conflict (id) do nothing;

insert into public.courts (id, club_id, name, is_covered, sort_order) values
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111111', 'Cancha 1', true, 1),
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111111', 'Cancha 2', true, 2),
  ('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111111', 'Cancha 3', false, 3)
on conflict (id) do nothing;
```

- [ ] **Step 2: Resetear y confirmar que los tests no chocan con el seed**

Run:
```bash
supabase db reset
supabase test db
```
Expected: `Seeding data from supabase/seed.sql...` y `All tests successful` (los tests usan slugs `test-club-*`, no `rustic`).

- [ ] **Step 3: Generar tipos**

Run: `npm run db:types`
Expected: `lib/supabase/database.types.ts` existe y contiene `clubs`, `courts`, `profiles`, `club_members`, `court_occupancy` y los enums `club_role`, `occupancy_kind`.

- [ ] **Step 4: Commit**

```bash
git add supabase/seed.sql lib/supabase/database.types.ts
git commit -m "chore(db): add placeholder seed and generated types"
```

---

### Task 11: Variables de entorno y clientes Supabase

**Files:**
- Create: `lib/supabase/env.ts`
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `.env.example`, `.env.local` (no se commitea)
- Test: `tests/unit/lib/supabase/env.test.ts`

- [ ] **Step 1: Instalar dependencias**

```bash
npm i @supabase/supabase-js @supabase/ssr server-only
```

- [ ] **Step 2: Stub de `getSupabaseEnv`**

`lib/supabase/env.ts`:
```ts
export type SupabaseEnv = { url: string; publishableKey: string }

export function getSupabaseEnv(): SupabaseEnv {
  throw new Error('not implemented')
}
```

- [ ] **Step 3: Test que falla**

`tests/unit/lib/supabase/env.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseEnv } from '@/lib/supabase/env'

describe('getSupabaseEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns the URL and publishable key', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-key')

    expect(getSupabaseEnv()).toEqual({ url: 'http://127.0.0.1:54321', publishableKey: 'test-key' })
  })

  it('names the missing URL variable', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-key')

    expect(() => getSupabaseEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('names the missing key variable', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '')

    expect(() => getSupabaseEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/)
  })
})
```

- [ ] **Step 4: Correr y ver que falla**

Run: `npm test -- tests/unit/lib/supabase/env.test.ts`
Expected: FAIL con `Error: not implemented`.

- [ ] **Step 5: Implementar**

`lib/supabase/env.ts`:
```ts
export type SupabaseEnv = { url: string; publishableKey: string }

export function getSupabaseEnv(): SupabaseEnv {
  // Read each variable by its literal name so Next inlines them in the browser bundle.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url) {
    throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL. Copiala de `supabase status` a .env.local.')
  }
  if (!publishableKey) {
    throw new Error('Falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copiala de `supabase status` a .env.local.')
  }

  return { url, publishableKey }
}
```

- [ ] **Step 6: Correr y ver que pasa**

Run: `npm test`
Expected: PASS, 10 tests.

- [ ] **Step 7: Clientes de navegador y servidor**

`# (sin test unitario — wrappers sin lógica propia; los cubre el smoke e2e de la Task 22)`

`lib/supabase/client.ts`:
```ts
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'
import { getSupabaseEnv } from './env'

export function createClient() {
  const { url, publishableKey } = getSupabaseEnv()
  return createBrowserClient<Database>(url, publishableKey)
}
```

`lib/supabase/server.ts`:
```ts
import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './database.types'
import { getSupabaseEnv } from './env'

export async function createClient() {
  const cookieStore = await cookies()
  const { url, publishableKey } = getSupabaseEnv()

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Server Components cannot set cookies. The proxy refreshes the session instead.
        }
      },
    },
  })
}
```

- [ ] **Step 8: `.env.example` y `.env.local`**

`.env.example`:
```dotenv
# Local: copy API_URL and PUBLISHABLE_KEY (or ANON_KEY) from `supabase status -o env`.
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

# Optional. Overrides the public URL used in email links and OAuth redirects.
# NEXT_PUBLIC_SITE_URL=

# The service role key never gets a NEXT_PUBLIC_ prefix and is not used in fase 0.
```

Crear `.env.local` con los mismos dos valores reales:
```bash
cp .env.example .env.local
supabase status -o env
```
Pegar en `.env.local` el valor de `PUBLISHABLE_KEY` (o `ANON_KEY` si esa versión del CLI no lo muestra) en `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Confirmar con `git status` que `.env.local` no aparece.

- [ ] **Step 9: Typecheck y commit**

Run: `npm run typecheck`
Expected: sin errores.

```bash
git add package.json package-lock.json lib/supabase/env.ts lib/supabase/client.ts lib/supabase/server.ts tests/unit/lib/supabase .env.example
git commit -m "feat: add Supabase env validation and SSR clients"
```

---

### Task 12: Redirecciones seguras (`safeNextPath`, `getSiteUrl`)

**Files:**
- Create: `lib/auth/redirect.ts`
- Test: `tests/unit/lib/auth/redirect.test.ts`

- [ ] **Step 1: Stub**

`lib/auth/redirect.ts`:
```ts
type Env = Record<string, string | undefined>

export function safeNextPath(value: unknown, fallback = '/'): string {
  void value
  void fallback
  throw new Error('not implemented')
}

export function getSiteUrl(env: Env = process.env): string {
  void env
  throw new Error('not implemented')
}
```

- [ ] **Step 2: Test que falla**

`tests/unit/lib/auth/redirect.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { getSiteUrl, safeNextPath } from '@/lib/auth/redirect'

describe('safeNextPath', () => {
  it.each(['/', '/reservar', '/partidos?fecha=2026-10-01'])('keeps the internal path %s', (path) => {
    expect(safeNextPath(path)).toBe(path)
  })

  it.each([
    null,
    undefined,
    42,
    '',
    'reservar',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
  ])('falls back to / for %j', (value) => {
    expect(safeNextPath(value)).toBe('/')
  })

  it('uses the given fallback', () => {
    expect(safeNextPath('//evil.example', '/inicio')).toBe('/inicio')
  })
})

describe('getSiteUrl', () => {
  it('prefers NEXT_PUBLIC_SITE_URL and drops the trailing slash', () => {
    expect(getSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://rustic.example/', VERCEL_URL: 'padel-abc.vercel.app' }))
      .toBe('https://rustic.example')
  })

  it('uses the stable production domain on Vercel production', () => {
    expect(getSiteUrl({
      VERCEL_ENV: 'production',
      VERCEL_PROJECT_PRODUCTION_URL: 'padel-management.vercel.app',
      VERCEL_URL: 'padel-management-abc123.vercel.app',
    })).toBe('https://padel-management.vercel.app')
  })

  it('uses the deployment URL on previews', () => {
    expect(getSiteUrl({ VERCEL_ENV: 'preview', VERCEL_URL: 'padel-git-feat-x.vercel.app' }))
      .toBe('https://padel-git-feat-x.vercel.app')
  })

  it('falls back to localhost', () => {
    expect(getSiteUrl({})).toBe('http://localhost:3000')
  })
})
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npm test -- tests/unit/lib/auth/redirect.test.ts`
Expected: FAIL con `Error: not implemented`.

- [ ] **Step 4: Implementar**

`lib/auth/redirect.ts`:
```ts
type Env = Record<string, string | undefined>

// Browsers strip tabs and newlines from URLs and treat "\" like "/",
// so "/\t/evil.example" would end up as the protocol-relative "//evil.example".
const UNSAFE_CHARACTERS = /[\s\\\u0000-\u001f]/

export function safeNextPath(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string') return fallback
  if (!value.startsWith('/') || value.startsWith('//')) return fallback
  if (UNSAFE_CHARACTERS.test(value)) return fallback
  return value
}

export function getSiteUrl(env: Env = process.env): string {
  if (env.NEXT_PUBLIC_SITE_URL) return env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '')
  if (env.VERCEL_ENV === 'production' && env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`
  return 'http://localhost:3000'
}
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `npm test`
Expected: PASS, 28 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/auth tests/unit/lib/auth
git commit -m "feat: add safe redirect helpers for auth"
```

---

### Task 13: Refresco de sesión (`proxy` / `middleware`)

**Files:**
- Create: `lib/supabase/proxy.ts`
- Create: `proxy.ts` (Next 16+) **o** `middleware.ts` (Next 15), según la Task 2 Step 3

`# (sin test unitario — integración con Next; lo cubre el smoke e2e de la Task 22)`

- [ ] **Step 1: `updateSession`**

`lib/supabase/proxy.ts`:
```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from './database.types'
import { getSupabaseEnv } from './env'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const { url, publishableKey } = getSupabaseEnv()

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // Keep this call right after creating the client: it is what refreshes an expired session.
  await supabase.auth.getUser()

  return response
}
```

- [ ] **Step 2a (Next 16+): `proxy.ts` en la raíz**

```ts
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
```

- [ ] **Step 2b (solo Next 15): `middleware.ts` en la raíz**

```ts
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
```

- [ ] **Step 3: Verificar**

Run: `npm run typecheck`, luego `npm run dev` y abrir `http://localhost:3000`.
Expected: la página carga sin errores en la terminal. Cortar con Ctrl+C.

No protegemos rutas todavía: no hay pantallas privadas en fase 0.

- [ ] **Step 4: Commit**

Next 16+:
```bash
git add lib/supabase/proxy.ts proxy.ts
git commit -m "feat: refresh Supabase session on every request"
```

Next 15:
```bash
git add lib/supabase/proxy.ts middleware.ts
git commit -m "feat: refresh Supabase session on every request"
```

---

### Task 14: Tokens Rustic, fuentes y layout

**Files:**
- Modify: `app/globals.css` (reemplazo completo)
- Modify: `app/layout.tsx` (reemplazo completo)
- Test: `tests/unit/app/design-tokens.test.ts`

El test lee `app/globals.css` real: si alguien cambia un color y rompe el contraste mínimo de 4.5:1, CI falla.

- [ ] **Step 1: Test que falla**

`tests/unit/app/design-tokens.test.ts`:
```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/design/contrast'

type Theme = Record<string, string>

function readThemes(): { dark: Theme; light: Theme } {
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')
  const blocks = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map((match) => match[1])
  expect(blocks, 'globals.css needs a dark :root and a light :root inside the media query').toHaveLength(2)

  const parse = (block: string): Theme =>
    Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)].map((m) => [m[1], m[2]]))

  return { dark: parse(blocks[0]), light: parse(blocks[1]) }
}

const TOKENS = ['bg', 'surface', 'border', 'fg', 'fg-muted', 'accent', 'on-accent', 'accent-ink', 'court', 'on-court', 'court-ink']

const READABLE_PAIRS: Array<[string, string]> = [
  ['fg', 'bg'],
  ['fg', 'surface'],
  ['fg-muted', 'bg'],
  ['fg-muted', 'surface'],
  ['accent-ink', 'bg'],
  ['accent-ink', 'surface'],
  ['court-ink', 'bg'],
  ['court-ink', 'surface'],
  ['on-accent', 'accent'],
  ['on-court', 'court'],
]

describe('Rustic design tokens', () => {
  const themes = readThemes()

  it('uses the night background in dark mode, which is the default', () => {
    expect(themes.dark.bg.toUpperCase()).toBe('#021716')
  })

  it.each(['dark', 'light'] as const)('defines every semantic token in %s mode', (mode) => {
    expect(Object.keys(themes[mode]).sort()).toEqual([...TOKENS].sort())
  })

  it.each(['dark', 'light'] as const)('keeps text pairs at 4.5:1 or more in %s mode', (mode) => {
    for (const [fg, bg] of READABLE_PAIRS) {
      const ratio = contrastRatio(themes[mode][fg], themes[mode][bg])
      expect(ratio, `${mode}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npm test -- tests/unit/app/design-tokens.test.ts`
Expected: FAIL: el `globals.css` del scaffold no tiene dos bloques `:root` con estos tokens (`expected [...] to have a length of 2` o tokens faltantes).

- [ ] **Step 3: `app/globals.css`**

Reemplazar todo el archivo:
```css
@import "tailwindcss";

/* Dark is the default: it is the club's identity and most games are at night. */
:root {
  color-scheme: dark;
  --bg: #021716;
  --surface: #0A2624;
  --border: #1E3A38;
  --fg: #FFFFFF;
  --fg-muted: #B8C4C3;
  --accent: #FCB021;
  --on-accent: #000000;
  --accent-ink: #FCB021;
  --court: #025995;
  --on-court: #FFFFFF;
  --court-ink: #4DA3DB;
}

/* Amber never works as text on a light background (1.85:1), so light mode uses amber-ink. */
@media (prefers-color-scheme: light) {
  :root {
    color-scheme: light;
    --bg: #FFFFFF;
    --surface: #F1F4F4;
    --border: #D5DCDB;
    --fg: #021716;
    --fg-muted: #4A5857;
    --accent: #FCB021;
    --on-accent: #000000;
    --accent-ink: #8A5A00;
    --court: #025995;
    --on-court: #FFFFFF;
    --court-ink: #025995;
  }
}

/* Raw brand palette, measured on the tournament poster. */
@theme {
  --color-rustic-amber: #FCB021;
  --color-rustic-amber-ink: #8A5A00;
  --color-night: #021716;
  --color-court-blue: #025995;
  --color-court-blue-light: #4DA3DB;
}

/* Semantic utilities (bg-bg, text-fg, bg-accent, text-court-ink...) follow the active mode. */
@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-border: var(--border);
  --color-fg: var(--fg);
  --color-fg-muted: var(--fg-muted);
  --color-accent: var(--accent);
  --color-on-accent: var(--on-accent);
  --color-accent-ink: var(--accent-ink);
  --color-court: var(--court);
  --color-on-court: var(--on-court);
  --color-court-ink: var(--court-ink);
  --font-sans: var(--font-barlow), ui-sans-serif, system-ui, sans-serif;
  --font-display: var(--font-barlow-condensed), var(--font-barlow), ui-sans-serif, sans-serif;
}

body {
  background: var(--bg);
  color: var(--fg);
}
```

- [ ] **Step 4: `app/layout.tsx`**

Reemplazar todo el archivo:
```tsx
import type { Metadata, Viewport } from 'next'
import { Barlow, Barlow_Condensed } from 'next/font/google'
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

export const metadata: Metadata = {
  title: { default: 'Rustic Pádel', template: '%s · Rustic Pádel' },
  description: 'Reservá cancha y armá partido en Rustic Pádel.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#021716' },
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
  ],
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body className="min-h-dvh bg-bg font-sans text-fg antialiased">{children}</body>
    </html>
  )
}
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `npm test`
Expected: PASS, 33 tests.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css app/layout.tsx tests/unit/app
git commit -m "feat(ui): add Rustic design tokens, fonts and theme"
```

---

### Task 15: Logo placeholder

**Files:**
- Create: `components/brand/logo.tsx`
- Create: `app/icon.svg`
- Delete: `app/favicon.ico`

`# (sin test — placeholder visual; se reemplaza por el SVG del club)`

- [ ] **Step 1: Componente**

`components/brand/logo.tsx`:
```tsx
// Placeholder until the club sends its SVG. Replace the <svg> contents, keep the props.
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="Rustic Pádel" className={className}>
      <circle cx="32" cy="32" r="30" fill="#FCB021" />
      <text
        x="32"
        y="41"
        textAnchor="middle"
        fontFamily="var(--font-barlow-condensed), sans-serif"
        fontWeight="700"
        fontSize="26"
        fill="#000000"
      >
        RP
      </text>
    </svg>
  )
}
```

- [ ] **Step 2: Favicon**

`app/icon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="30" fill="#FCB021"/>
  <text x="32" y="41" text-anchor="middle" font-family="Arial Narrow, Arial, sans-serif" font-weight="700" font-size="26" fill="#000000">RP</text>
</svg>
```

Run: `git rm app/favicon.ico`

- [ ] **Step 3: Commit**

```bash
git add components/brand app/icon.svg
git commit -m "feat(ui): add placeholder logo and favicon"
```

---

### Task 16: Botón

**Files:**
- Create: `components/ui/button.tsx`
- Test: `tests/unit/components/ui/button.test.tsx`

- [ ] **Step 1: Stub**

`components/ui/button.tsx`:
```tsx
import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
type ButtonStyle = { variant?: ButtonVariant; fullWidth?: boolean; className?: string }
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyle

export function buttonClasses(style: ButtonStyle = {}): string {
  void style
  throw new Error('not implemented')
}

export function Button(props: ButtonProps) {
  void props
  throw new Error('not implemented')
}
```

- [ ] **Step 2: Test que falla**

`tests/unit/components/ui/button.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button, buttonClasses } from '@/components/ui/button'

describe('Button', () => {
  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Reservar</Button>)
    expect(screen.getByRole('button', { name: 'Reservar' })).toHaveAttribute('type', 'button')
  })

  it('keeps the 44px minimum touch target in every variant', () => {
    for (const variant of ['primary', 'secondary', 'ghost'] as const) {
      expect(buttonClasses({ variant })).toContain('min-h-11')
    }
  })

  it('uses amber with black text for the primary action', () => {
    render(<Button>Reservar</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-accent', 'text-on-accent')
  })

  it('calls onClick, and not when disabled', async () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button onClick={onClick}>Reservar</Button>)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)

    rerender(<Button onClick={onClick} disabled>Reservar</Button>)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('stretches with fullWidth and keeps extra classes', () => {
    render(<Button fullWidth className="mt-4">Reservar</Button>)
    expect(screen.getByRole('button')).toHaveClass('w-full', 'mt-4')
  })
})
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npm test -- tests/unit/components/ui/button.test.tsx`
Expected: FAIL con `Error: not implemented`.

- [ ] **Step 4: Implementar**

`components/ui/button.tsx`:
```tsx
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
type ButtonStyle = { variant?: ButtonVariant; fullWidth?: boolean; className?: string }
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyle

const BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 font-display text-lg font-bold uppercase tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:brightness-95',
  secondary: 'border border-border bg-surface text-fg hover:border-accent',
  ghost: 'text-accent-ink hover:bg-surface',
}

// Also used by links that look like buttons (<Link className={buttonClasses()}>).
export function buttonClasses({ variant = 'primary', fullWidth = false, className }: ButtonStyle = {}): string {
  return cn(BASE, VARIANTS[variant], fullWidth && 'w-full', className)
}

export function Button({ variant, fullWidth, className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses({ variant, fullWidth, className })} {...props} />
}
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `npm test`
Expected: PASS, 38 tests.

- [ ] **Step 6: Commit**

```bash
git add components/ui/button.tsx tests/unit/components/ui/button.test.tsx
git commit -m "feat(ui): add Button with 44px touch target"
```

---

### Task 17: Tarjeta

**Files:**
- Create: `components/ui/card.tsx`
- Test: `tests/unit/components/ui/card.test.tsx`

- [ ] **Step 1: Stub**

`components/ui/card.tsx`:
```tsx
import type { HTMLAttributes } from 'react'

export function Card(props: HTMLAttributes<HTMLDivElement>) {
  void props
  throw new Error('not implemented')
}
```

- [ ] **Step 2: Test que falla**

`tests/unit/components/ui/card.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card } from '@/components/ui/card'

describe('Card', () => {
  it('renders its content on the surface color', () => {
    render(<Card>Cancha 1</Card>)
    expect(screen.getByText('Cancha 1')).toHaveClass('bg-surface', 'rounded-2xl', 'p-4')
  })

  it('lets callers override padding and pass props through', () => {
    render(<Card className="p-6" data-testid="card">Cancha 1</Card>)
    const card = screen.getByTestId('card')
    expect(card).toHaveClass('p-6')
    expect(card).not.toHaveClass('p-4')
  })
})
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npm test -- tests/unit/components/ui/card.test.tsx`
Expected: FAIL con `Error: not implemented`.

- [ ] **Step 4: Implementar**

`components/ui/card.tsx`:
```tsx
import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-border bg-surface p-4', className)} {...props} />
}
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `npm test`
Expected: PASS, 40 tests.

- [ ] **Step 6: Commit**

```bash
git add components/ui/card.tsx tests/unit/components/ui/card.test.tsx
git commit -m "feat(ui): add Card"
```

---

### Task 18: Hoja inferior

**Files:**
- Create: `components/ui/bottom-sheet.tsx`
- Test: `tests/unit/components/ui/bottom-sheet.test.tsx`

Regla de UX del plan general: toda hoja emergente tiene cierre visible (✕).

- [ ] **Step 1: Stub**

`components/ui/bottom-sheet.tsx`:
```tsx
'use client'

import type { ReactNode } from 'react'

export type BottomSheetProps = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function BottomSheet(props: BottomSheetProps) {
  void props
  throw new Error('not implemented')
}
```

- [ ] **Step 2: Test que falla**

`tests/unit/components/ui/bottom-sheet.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BottomSheet } from '@/components/ui/bottom-sheet'

function renderSheet(open = true) {
  const onClose = vi.fn()
  render(
    <BottomSheet open={open} onClose={onClose} title="Reservar cancha">
      <p>Contenido</p>
    </BottomSheet>,
  )
  return { onClose }
}

describe('BottomSheet', () => {
  it('renders nothing while closed', () => {
    renderSheet(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is a modal dialog named by its title', () => {
    renderSheet()
    const dialog = screen.getByRole('dialog', { name: 'Reservar cancha' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Contenido')).toBeInTheDocument()
  })

  it('always shows a visible ✕ close button and focuses it on open', () => {
    renderSheet()
    const close = screen.getByRole('button', { name: 'Cerrar' })
    expect(close).toBeVisible()
    expect(close).toHaveTextContent('✕')
    expect(close).toHaveFocus()
  })

  it('closes from the ✕ button', async () => {
    const { onClose } = renderSheet()
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes with Escape', async () => {
    const { onClose } = renderSheet()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when tapping the backdrop', async () => {
    const { onClose } = renderSheet()
    await userEvent.click(screen.getByTestId('sheet-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npm test -- tests/unit/components/ui/bottom-sheet.test.tsx`
Expected: FAIL con `Error: not implemented` (el primer test también falla porque el stub tira aunque `open` sea false).

- [ ] **Step 4: Implementar**

`components/ui/bottom-sheet.tsx`:
```tsx
'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'

export type BottomSheetProps = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const titleId = useId()
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        aria-hidden="true"
        data-testid="sheet-backdrop"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border-t border-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id={titleId} className="font-display text-2xl font-bold uppercase">
            {title}
          </h2>
          <button
            ref={closeButton}
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-2xl text-fg hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `npm test`
Expected: PASS, 46 tests.

- [ ] **Step 6: Commit**

```bash
git add components/ui/bottom-sheet.tsx tests/unit/components/ui/bottom-sheet.test.tsx
git commit -m "feat(ui): add BottomSheet with visible close"
```

---

### Task 19: Playwright y smoke e2e (rojo)

**Files:**
- Create: `playwright.config.ts`
- Test: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Instalar**

```bash
npm i -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Config**

`playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test'

const PORT = 3000

export default defineConfig({
  testDir: './tests/e2e',
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
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
```

- [ ] **Step 3: Smoke test**

`tests/e2e/smoke.spec.ts`:
```ts
import { expect, test } from '@playwright/test'

test('a visitor reaches sign-in and asks for a magic link', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Rustic Pádel' })).toBeVisible()

  await page.getByRole('link', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/auth\/ingreso$/)

  await page.getByLabel('Email').fill(`smoke+${Date.now()}@example.com`)
  await page.getByRole('button', { name: 'Enviarme el enlace' }).click()

  await expect(page.getByRole('status')).toContainText('Revisá tu email')
})
```

- [ ] **Step 4: Correr y ver que falla**

Con `supabase start` corriendo y `.env.local` cargado:

Run: `npm run test:e2e`
Expected: FAIL: la página de inicio del scaffold no tiene el heading `Rustic Pádel`.

- [ ] **Step 5: Commit (rojo a propósito)**

```bash
git add package.json package-lock.json playwright.config.ts tests/e2e
git commit -m "test(e2e): add Playwright smoke for sign-in"
```

---

### Task 20: Ingreso (enlace mágico y Google)

**Files:**
- Create: `app/auth/ingreso/actions.ts`
- Create: `app/auth/ingreso/magic-link-form.tsx`
- Create: `app/auth/ingreso/page.tsx`

`# (sin test unitario — server actions contra Supabase; lo cubre el smoke e2e)`

- [ ] **Step 1: Server actions**

`app/auth/ingreso/actions.ts`:
```ts
'use server'

import { redirect } from 'next/navigation'
import { getSiteUrl, safeNextPath } from '@/lib/auth/redirect'
import { createClient } from '@/lib/supabase/server'

export type MagicLinkState = { status: 'idle' | 'sent' | 'error'; message?: string }

function callbackUrl(next: string): string {
  return `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`
}

export async function sendMagicLink(_previous: MagicLinkState, formData: FormData): Promise<MagicLinkState> {
  const email = String(formData.get('email') ?? '').trim()
  if (!email) return { status: 'error', message: 'Ingresá tu email.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackUrl(safeNextPath(formData.get('next'))) },
  })

  if (error) return { status: 'error', message: 'No pudimos enviar el enlace. Probá de nuevo en un minuto.' }
  return { status: 'sent' }
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callbackUrl(safeNextPath(formData.get('next'))) },
  })

  if (error || !data.url) redirect('/auth/ingreso?error=google')
  redirect(data.url)
}
```

- [ ] **Step 2: Formulario de enlace mágico**

`app/auth/ingreso/magic-link-form.tsx`:
```tsx
'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { sendMagicLink, type MagicLinkState } from './actions'

const initialState: MagicLinkState = { status: 'idle' }

export function MagicLinkForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(sendMagicLink, initialState)

  if (state.status === 'sent') {
    return (
      <p role="status" className="text-lg">
        Revisá tu email: te mandamos un enlace para entrar.
      </p>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email" className="text-sm font-semibold">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        placeholder="vos@email.com"
        className="min-h-11 rounded-xl border border-border bg-bg px-4 text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent"
      />
      {state.status === 'error' ? (
        <p role="alert" className="text-sm">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" fullWidth disabled={pending}>
        {pending ? 'Enviando…' : 'Enviarme el enlace'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 3: Página de ingreso**

`app/auth/ingreso/page.tsx`:
```tsx
import type { Metadata } from 'next'
import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { safeNextPath } from '@/lib/auth/redirect'
import { signInWithGoogle } from './actions'
import { MagicLinkForm } from './magic-link-form'

export const metadata: Metadata = { title: 'Ingresar' }

const ERROR_MESSAGES: Record<string, string> = {
  callback: 'El enlace venció o ya se usó. Pedí uno nuevo.',
  google: 'No pudimos conectar con Google. Probá de nuevo o usá tu email.',
}

type SearchParams = Promise<{ next?: string; error?: string }>

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const { next, error } = await searchParams
  const nextPath = safeNextPath(next)
  // hasOwn so "?error=constructor" does not pick up Object.prototype.
  const errorMessage = error && Object.hasOwn(ERROR_MESSAGES, error) ? ERROR_MESSAGES[error] : null

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-4 py-10">
      <Logo className="size-14" />
      <h1 className="font-display text-4xl font-bold uppercase">Ingresar</h1>

      {errorMessage ? (
        <p role="alert" className="rounded-xl border border-border bg-surface p-3">
          {errorMessage}
        </p>
      ) : null}

      <Card className="flex flex-col gap-4">
        <MagicLinkForm next={nextPath} />
        <div className="flex items-center gap-3 text-sm text-fg-muted">
          <span className="h-px flex-1 bg-border" />o<span className="h-px flex-1 bg-border" />
        </div>
        <form action={signInWithGoogle}>
          <input type="hidden" name="next" value={nextPath} />
          <Button type="submit" variant="secondary" fullWidth>
            Seguir con Google
          </Button>
        </form>
      </Card>
    </main>
  )
}
```

Localmente Google está deshabilitado en `config.toml`: el botón vuelve a `/auth/ingreso?error=google`. Es lo esperado hasta la Task 28.

- [ ] **Step 4: Typecheck y commit**

Run: `npm run typecheck`
Expected: sin errores.

```bash
git add app/auth/ingreso
git commit -m "feat(auth): add sign-in page with magic link and Google"
```

---

### Task 21: Callback de autenticación

**Files:**
- Create: `app/auth/callback/route.ts`

`# (sin test unitario — canje real contra Supabase; se verifica a mano con Mailpit en la Task 22)`

- [ ] **Step 1: Route handler**

`app/auth/callback/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server'
import { safeNextPath } from '@/lib/auth/redirect'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(next, origin))
  }

  return NextResponse.redirect(new URL('/auth/ingreso?error=callback', origin))
}
```

- [ ] **Step 2: Typecheck y commit**

Run: `npm run typecheck`
Expected: sin errores.

```bash
git add app/auth/callback
git commit -m "feat(auth): exchange auth code for a session"
```

---

### Task 22: Inicio mínimo (smoke en verde)

**Files:**
- Modify: `app/page.tsx` (reemplazo completo)
- Delete: `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg` (los que haya dejado el scaffold)

- [ ] **Step 1: Página de inicio**

`app/page.tsx`:
```tsx
import Link from 'next/link'
import { Logo } from '@/components/brand/logo'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-10">
      <Logo className="size-16" />
      <h1 className="font-display text-4xl font-bold uppercase">Rustic Pádel</h1>
      <Card>
        {user ? (
          <p>
            Sesión iniciada como <strong>{user.email}</strong>.
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
    </main>
  )
}
```

- [ ] **Step 2: Borrar assets del scaffold**

Run: `git rm --ignore-unmatch public/file.svg public/globe.svg public/next.svg public/vercel.svg public/window.svg`

- [ ] **Step 3: Correr el smoke**

Con `supabase start` corriendo:

Run: `npm run test:e2e`
Expected: PASS, `1 passed`.

- [ ] **Step 4: Verificación manual del enlace mágico**

1. `npm run dev`, abrir `http://localhost:3000`, tocar **Ingresar**, poner `yo@example.com`, enviar.
2. Abrir Mailpit (`http://127.0.0.1:54324`), abrir el último email y tocar el enlace.
3. Expected: vuelve a `http://localhost:3000/` y muestra "Sesión iniciada como yo@example.com".
4. En Studio (`http://127.0.0.1:54323`) → tabla `profiles`: existe la fila con `display_name = 'yo'`.

- [ ] **Step 5: Suite completa y commit**

Run:
```bash
npm run lint
npm run typecheck
npm test
supabase test db
```
Expected: todo en verde.

```bash
git add app/page.tsx
git commit -m "feat: add minimal home page with session state"
```

---

### Task 23: CI en cada PR

**Files:**
- Create: `.github/workflows/ci.yml`

`# (sin test — el propio workflow es la verificación; corre en la Task 27)`

- [ ] **Step 1: Workflow**

`.github/workflows/ci.yml` (reemplazar `2.118.0` por la versión exacta anotada en la Task 1):
```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    name: quality
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test

  db-and-e2e:
    name: db-and-e2e
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - uses: supabase/setup-cli@v1
        with:
          version: 2.118.0

      - name: Start Supabase
        run: supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor

      - name: Generated types match the migrations
        run: |
          supabase gen types typescript --local --schema public > /tmp/database.types.ts
          diff -u lib/supabase/database.types.ts /tmp/database.types.ts

      - name: pgTAP
        run: supabase test db

      - name: Expose local Supabase to the app
        run: |
          supabase status -o json | jq -r '"NEXT_PUBLIC_SUPABASE_URL=\(.API_URL)", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=\(.ANON_KEY)"' >> "$GITHUB_ENV"

      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - run: npm run test:e2e

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

Si el paso de tipos falla en un PR, el arreglo es correr `npm run db:types` y commitear.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run lint, typecheck, Vitest, pgTAP and Playwright on PRs"
```

---

### Task 24: Migraciones a producción al hacer merge

**Files:**
- Create: `.github/workflows/migrate.yml`

`# (sin test — se verifica tras el merge en la Task 32)`

- [ ] **Step 1: Workflow**

`.github/workflows/migrate.yml`:
```yaml
name: Migrate production

on:
  push:
    branches: [main]
    paths: ['supabase/migrations/**']
  workflow_dispatch:

# Never run two pushes against the production database at once.
concurrency:
  group: migrate-production
  cancel-in-progress: false

jobs:
  db-push:
    runs-on: ubuntu-latest
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: 2.118.0
      - run: supabase link --project-ref "${{ secrets.SUPABASE_PROJECT_REF }}"
      - run: supabase db push
```

Vercel despliega el merge en paralelo, así que una migración puede llegar segundos después del código. Regla desde ya: migraciones compatibles hacia atrás (agregar primero, sacar en un PR posterior).

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/migrate.yml
git commit -m "ci: push migrations to production on merge"
```

---

### Task 25: Backup semanal y ping anti-pausa

**Files:**
- Create: `.github/workflows/backup.yml`
- Create: `.github/workflows/keepalive.yml`

`# (sin test — se disparan a mano con workflow_dispatch en la Task 32)`

- [ ] **Step 1: Backup**

`.github/workflows/backup.yml`:
```yaml
name: Backup production

on:
  schedule:
    - cron: '0 6 * * 1' # Mondays 06:00 UTC, 03:00 in Montevideo
  workflow_dispatch:

jobs:
  dump:
    runs-on: ubuntu-latest
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: 2.118.0
      - run: supabase link --project-ref "${{ secrets.SUPABASE_PROJECT_REF }}"
      - run: supabase db dump --linked -f roles.sql --role-only
      - run: supabase db dump --linked -f schema.sql
      - run: supabase db dump --linked -f data.sql --use-copy --data-only
      # Artifacts of a private repo are only visible to its collaborators.
      - uses: actions/upload-artifact@v4
        with:
          name: supabase-backup-${{ github.run_id }}
          path: |
            roles.sql
            schema.sql
            data.sql
          retention-days: 90
```

- [ ] **Step 2: Ping anti-pausa**

`.github/workflows/keepalive.yml`:
```yaml
name: Keep Supabase awake

# Free projects pause after a week without activity. We ping every three days.
on:
  schedule:
    - cron: '0 12 */3 * *'
  workflow_dispatch:

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Query the REST API
        env:
          PROJECT_REF: ${{ secrets.SUPABASE_PROJECT_REF }}
          PUBLISHABLE_KEY: ${{ secrets.SUPABASE_PUBLISHABLE_KEY }}
        run: |
          curl --fail --silent --show-error \
            "https://${PROJECT_REF}.supabase.co/rest/v1/clubs?select=id&limit=1" \
            -H "apikey: ${PUBLISHABLE_KEY}" > /dev/null
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/backup.yml .github/workflows/keepalive.yml
git commit -m "ci: add weekly backup and Supabase keepalive"
```

---

### Task 26: README y notas

**Files:**
- Modify: `README.md` (reemplazo completo)
- Modify: `docs/features/fase-0-base/notes.md`

`# (sin test — docs)`

- [ ] **Step 1: README**

`README.md`:
````markdown
# Rustic Pádel

App de reservas para Rustic Pádel: Next.js en Vercel, Supabase (Postgres + Auth) como base.
Producto y fases en [docs/plan-general.md](docs/plan-general.md).

## Requisitos

Node 22, npm 10, Docker Desktop corriendo, Supabase CLI 2.118.

## Primeros pasos

```bash
npm ci
supabase start                 # levanta Postgres, Auth y Mailpit en Docker
cp .env.example .env.local     # pegar API_URL y PUBLISHABLE_KEY de `supabase status -o env`
npm run dev                    # http://localhost:3000
```

Los emails de ingreso locales llegan a Mailpit: http://127.0.0.1:54324.

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run lint` / `npm run typecheck` | ESLint y TypeScript |
| `npm test` | Vitest (`tests/unit`) |
| `npm run test:db` | pgTAP (`supabase/tests`) |
| `npm run test:e2e` | Playwright (`tests/e2e`), necesita Supabase local |
| `npm run db:reset` | Recrea la base local con migraciones y `seed.sql` |
| `npm run db:types` | Regenera `lib/supabase/database.types.ts` |

## Cómo trabajamos

- Todo entra a `main` por PR con CI en verde (`quality`, `db-and-e2e`).
- Cambios de esquema: nueva migración en `supabase/migrations`, test pgTAP, `npm run db:types`. Al hacer merge, `migrate.yml` corre `supabase db push` en producción.
- Migraciones compatibles hacia atrás: Vercel y la migración se despliegan en paralelo.
- La clave de servicio de Supabase nunca lleva prefijo `NEXT_PUBLIC_`.

## Funciones disponibles

- Fase 0: ingreso por enlace mágico y Google, esquema núcleo con RLS, doble reserva imposible por constraint.
````

- [ ] **Step 2: Notas**

Agregar al final de `docs/features/fase-0-base/notes.md`:
```markdown
- 2026-09-28: decisiones del plan que el diseño no fijaba: `profiles` sin `club_id`; FK compuesta en `court_occupancy`; cancelar = borrar la ocupación; rangos `[)`; helpers RLS en schema `private`; Playwright corre en CI contra Supabase local; `seed.sql` solo local; previews de Vercel comparten el proyecto Supabase de producción; secret extra `SUPABASE_PUBLISHABLE_KEY` para el ping.
- Pendiente: proteger `main` en un repo privado requiere GitHub Pro (ver Task 30).
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/features/fase-0-base/notes.md
git commit -m "docs: add README and fase 0 notes"
```

---

### Task 27: Push de la rama y PR

`# (sin test — CI corre en el PR)`

- [ ] **Step 1: Push**

```bash
git push -u origin feat/fase-0-base
```

- [ ] **Step 2: Abrir el PR**

```bash
gh pr create --base main --head feat/fase-0-base --title "Fase 0: base técnica" --body "Implementa docs/features/fase-0-base/plan.md (alcance en design.md): esquema núcleo con RLS y pgTAP, ingreso por enlace mágico y Google, tokens Rustic, componentes base, CI, migraciones a producción, backup y ping."
```
Expected: URL del PR. (Si `gh` no está autenticado, lo abre el usuario desde GitHub.)

- [ ] **Step 3: Ver CI**

Run: `gh pr checks --watch`
Expected: `quality` y `db-and-e2e` en verde. `migrate.yml` no corre (no es push a `main`). Si falla `db-and-e2e` en Playwright, bajar el artefacto `playwright-report` del run.

**No mergear todavía:** `migrate.yml` necesita el proyecto y los secrets de las Tasks 28–29.

---

### Task 28: MANUAL (usuario) — Proyecto Supabase

- [ ] **Step 1:** En supabase.com → New project: nombre `padel-management`, región **South America (São Paulo)**, contraseña de base fuerte (guardarla en el gestor de contraseñas; es `SUPABASE_DB_PASSWORD`).
- [ ] **Step 2:** Anotar el *project ref* (el id en la URL del dashboard) y, en Project Settings → API Keys, la **publishable key**.
- [ ] **Step 3:** Project Settings → Database: confirmar que es Postgres 17. Si es otra versión, avisar para ajustar `[db] major_version` en `supabase/config.toml`.
- [ ] **Step 4:** Authentication → URL Configuration:
  - Site URL: `http://localhost:3000` por ahora (se cambia en la Task 31).
  - Redirect URLs: `http://localhost:3000/**`.
- [ ] **Step 5:** Google (se puede hacer después, no bloquea el merge; pendiente decidir si la cuenta es de Miguel o del club):
  - En Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web). Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
  - En Supabase → Authentication → Sign In / Providers → Google: habilitar y pegar Client ID y Secret.

---

### Task 29: MANUAL (usuario) — Secrets de GitHub Actions

- [ ] **Step 1:** Generar un access token en supabase.com → Account → Access Tokens.
- [ ] **Step 2:** En GitHub → repo → Settings → Secrets and variables → Actions → New repository secret, crear:

| Secret | Valor |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Token del Step 1 |
| `SUPABASE_DB_PASSWORD` | Contraseña de la base (Task 28 Step 1) |
| `SUPABASE_PROJECT_REF` | Project ref (Task 28 Step 2) |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key (Task 28 Step 2) |
| `BACKUP_PASSPHRASE` | Frase larga y aleatoria para cifrar los backups con GPG. Guardarla en el gestor de contraseñas: sin ella los backups no se pueden abrir |

---

### Task 30: MANUAL (usuario) — Proteger `main`

Proteger ramas en un repo **privado** requiere GitHub Pro (USD 4/mes) o un plan de organización. Con GitHub Free la pantalla deja crear la regla pero no la aplica. Opciones: pagar Pro, o seguir sin protección y respetar el flujo por PR a mano hasta que haya un segundo desarrollador.

Si hay Pro:

- [ ] **Step 1:** Settings → Branches → Add branch ruleset (o classic rule) para `main`:
  - Require a pull request before merging, con **0 aprobaciones requeridas** (un solo desarrollador no puede aprobar su propio PR).
  - Require status checks to pass: `quality` y `db-and-e2e` (aparecen en la lista porque ya corrieron en la Task 27). Marcar "Require branches to be up to date".
  - Block force pushes.

---

### Task 31: MANUAL (usuario) — Vercel

- [ ] **Step 1:** En vercel.com → Add New → Project → importar `mmonroy1686/padel-management`. Framework: Next.js (autodetectado). Sin cambios de build.
- [ ] **Step 2:** Environment Variables (Production y Preview):

| Variable | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key |

No cargar la service role key: fase 0 no la usa. `NEXT_PUBLIC_SITE_URL` no hace falta: `getSiteUrl` usa `VERCEL_PROJECT_PRODUCTION_URL` en producción y `VERCEL_URL` en previews (Settings → Environment Variables → "Automatically expose System Environment Variables" tiene que quedar activado, que es el default).

- [ ] **Step 3:** Deploy. Anotar el dominio de producción (`https://<proyecto>.vercel.app`) y el sufijo de previews (`-<equipo>.vercel.app`).
- [ ] **Step 4:** En Supabase → Authentication → URL Configuration:
  - Site URL: `https://<proyecto>.vercel.app`
  - Redirect URLs: `https://<proyecto>.vercel.app/**`, `https://*-<equipo>.vercel.app/**`, `http://localhost:3000/**`

Las previews usan el mismo proyecto Supabase que producción. Sin usuarios reales está bien; antes del piloto con el club decidimos si separamos un proyecto de staging.

---

### Task 32: Merge y verificación en producción

- [ ] **Step 1: Merge**

Con las Tasks 28–29 hechas:
```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 2: Migraciones**

Run: `gh run list --workflow migrate.yml --limit 1`
Expected: `completed success`. En Supabase → Table Editor aparecen `clubs`, `courts`, `profiles`, `club_members`, `court_occupancy` (vacías: producción no se siembra).

- [ ] **Step 3: Backup y ping**

```bash
gh workflow run backup.yml
gh workflow run keepalive.yml
gh run list --limit 2
```
Expected: ambos `completed success`; el backup tiene un artefacto `supabase-backup-<id>` con tres `.sql`.

- [ ] **Step 4: Ingreso en producción (MANUAL, usuario)**

Abrir `https://<proyecto>.vercel.app`, **Ingresar** con un email real, tocar el enlace del correo. Expected: vuelve al inicio con "Sesión iniciada como …" y aparece la fila en `profiles`. Si Google ya está configurado (Task 28 Step 5), repetir con **Seguir con Google**.

- [ ] **Step 5: Cerrar la fase**

Cambiar `status: draft` → `status: done` en el frontmatter de este plan y de `design.md`, y commitear por PR.

---

## Preguntas abiertas que no bloquean

- Datos reales de Rustic (canchas, techadas o no, horarios): reemplazan `seed.sql` y llegan a producción como migración de datos en fase 1.
- Logo SVG del club: reemplaza el contenido de `components/brand/logo.tsx` y `app/icon.svg`.
- Cuenta dueña de las credenciales OAuth de Google.
- GitHub Pro para proteger `main`.
