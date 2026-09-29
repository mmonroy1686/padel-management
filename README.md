# Rustic Pádel

App de reservas para Rustic Pádel: Next.js en Vercel, Supabase (Postgres + Auth) como base.
Producto y fases en [docs/plan-general.md](docs/plan-general.md).

## Requisitos

Node 22, npm 10 y Docker Desktop corriendo. El CLI de Supabase (2.118) viene como devDependency: se usa con `npx supabase` o desde los scripts de npm.

## Primeros pasos

```bash
npm ci
npx supabase start             # levanta Postgres, Auth y Mailpit en Docker
cp .env.example .env.local     # pegar API_URL y PUBLISHABLE_KEY de `npx supabase status -o env`
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
