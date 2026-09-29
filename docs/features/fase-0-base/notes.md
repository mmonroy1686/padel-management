---
feature: fase-0-base
type: note
date: 2026-09-28
branch: main
---

# fase-0-base — notes

- 2026-09-28: tooling local verificado: Node 22.14, npm 10.9, Docker 28.2, Supabase CLI 2.118. Repo sin commits, `origin` → github.com/mmonroy1686/padel-management.
- 2026-09-28: decisiones del plan que el diseño no fijaba: `profiles` sin `club_id`; FK compuesta en `court_occupancy`; cancelar = borrar la ocupación; rangos `[)`; helpers RLS en schema `private`; Playwright corre en CI contra Supabase local; `seed.sql` solo local; previews de Vercel comparten el proyecto Supabase de producción; secret extra `SUPABASE_PUBLISHABLE_KEY` para el ping.
- 2026-09-28: desvíos durante la ejecución:
  - Next quedó en 16.3.6 → `proxy.ts` (no `middleware.ts`). El scaffold agrega `AGENTS.md`: leer `node_modules/next/dist/docs/` antes de usar APIs de Next.
  - `@types/node` subido a `^22`: Vitest 5 no acepta `^20` como peer.
  - Supabase CLI `2.118.0` como devDependency (no hay CLI global); los scripts de npm lo resuelven.
  - `supabase gen types` en 2.118 genera sin formatear; la salida es estable y el diff de CI la compara tal cual.
  - CI toma `PUBLISHABLE_KEY` del `supabase status` (con `ANON_KEY` de respaldo).
  - Enlace mágico verificado de punta a punta en local con Mailpit (sesión iniciada + fila en `profiles`).
- Pendiente: proteger `main` en un repo privado requiere GitHub Pro (ver Task 30). `gh` CLI no está instalado: el PR se abre desde GitHub o instalando `gh`.
