---
feature: fase-0-base
type: design
status: design
date: 2026-09-28
branch: main
references: ../../plan-general.md
---

# fase-0-base — design

## Purpose

Dejar repo, base de datos, tests y deploy conectados antes de la primera pantalla real, para que cada cambio posterior llegue solo a producción por PR. Es la base técnica del MVP de reservas de Rustic Pádel (fase 1). Detalle completo del producto en [plan-general.md](../../plan-general.md).

## Alcance

1. App Next.js (App Router, TypeScript, Tailwind, ESLint) con la estructura de carpetas del plan general.
2. Supabase local (`supabase init` / `supabase start`) con migraciones versionadas.
3. Esquema núcleo: `clubs`, `courts`, `profiles`, `club_members`, `court_occupancy` (extensión `btree_gist` + `EXCLUDE USING gist (court_id WITH =, period WITH &&)`). Resto de tablas en sus fases.
4. RLS en cada tabla núcleo + tests pgTAP (jugador no lee ni modifica lo ajeno; doble reserva imposible).
5. Clientes Supabase de navegador y servidor (`@supabase/ssr`, sesión en cookies); ingreso por enlace mágico y Google con callback.
6. Tokens de diseño Rustic (variables CSS + Tailwind), fuentes Barlow / Barlow Condensed, logo placeholder, oscuro por defecto y claro por preferencia del sistema.
7. Componentes base mínimos: botón, tarjeta, hoja inferior.
8. Tests: Vitest (unit), pgTAP (DB), Playwright (un smoke e2e).
9. CI en GitHub Actions: lint, typecheck, Vitest, pgTAP en cada PR; `migrate.yml` (`supabase db push` en merge a `main`); `backup.yml` (dump semanal); ping anti-pausa.
10. `seed.sql` con Rustic y canchas (datos reales cuando el club los pase; placeholder mientras).

## Principles

- **Multi-club desde el día 1:** toda tabla de dominio lleva `club_id`; RLS resuelve permisos vía `club_members.role`.
- **La base garantiza las invariantes:** doble reserva imposible por constraint, no por código de app.
- **Secretos solo en servidor:** clave de servicio nunca llega al navegador.
- **TDD:** lógica en `lib/domain` y reglas de DB con tests antes de implementación.

## Fuera de alcance

Pantallas de jugador y club (fase 1+), pagos, torneos, day use, `pg_cron`.

## Tareas manuales del usuario (no automatizables)

- Crear proyecto Supabase (región São Paulo) y habilitar proveedor Google en Auth.
- Importar repo en Vercel y cargar variables de entorno.
- Proteger `main` en GitHub tras el primer push.
- Cargar secrets de GitHub Actions (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`).

## Open questions

- Datos reales de Rustic para `seed.sql`: cantidad de canchas, tipos, horarios de apertura.
- Logo SVG del club (placeholder mientras).
- Credenciales OAuth de Google: ¿cuenta de Miguel o del club?
