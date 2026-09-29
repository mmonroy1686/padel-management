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

`.env.local` puede apuntar al Supabase local o al de producción. `npm run test:e2e` siempre usa el stack local, sin importar qué diga `.env.local`.

### Probar en local con usuarios demo

```bash
npx supabase start
npm run db:reset       # esquema + club Rustic con los valores del prototipo
npm run demo:users     # admin@rustic.test, recepcion@rustic.test, jugador@rustic.test
npm run dev:local      # la app contra Supabase local, sin tocar .env.local
```

Ingresá en http://localhost:3000/auth/ingreso con uno de esos emails y abrí el enlace que llega a Mailpit (http://127.0.0.1:54324). Admin y recepción ven el panel en `/club/grilla`.

El seed local trae a Rustic con los valores del prototipo: 3 canchas, 08:00 a 23:00, turnos de 90 minutos, $1.200 y $1.600 desde las 18:30.

### Producción

Un usuario pasa a `club_members` cuando completa la bienvenida. Para dar rol de admin a una cuenta (Supabase → SQL Editor):

```sql
update public.club_members m set role = 'admin'
from auth.users u where u.id = m.user_id and u.email = 'vos@ejemplo.com';
```

Antes del piloto hace falta un SMTP propio en Supabase (Authentication → Emails): el que viene por defecto solo envía a miembros del equipo y muy pocos emails por hora.

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo (usa `.env.local`) |
| `npm run dev:local` | Servidor de desarrollo contra Supabase local |
| `npm run demo:users` | Crea admin, recepción y jugador demo en la base local |
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
- Reservas, cancelaciones, turnos fijos, bloqueos y pagos se escriben solo con las funciones de Postgres (`book_slot`, `staff_book`, `create_series`, `report_transfer`, …). Nadie escribe directo en `bookings`, `court_occupancy` ni `payments`.
- Cada función falla con un código estable (`slot_taken`, `notice_period`, …); `lib/domain/errors.ts` lo traduce. Un código nuevo va en los dos lados.
- Una migración que ya está en producción no se edita: se agrega otra.
- Los e2e crean usuarios `@e2e.test` en el Supabase local y los borran al empezar cada corrida; se niegan a correr contra otro Supabase.

## Funciones disponibles

- Fase 0: ingreso por enlace mágico y Google, esquema núcleo con RLS, doble reserva imposible por constraint, límites de reserva y cancelación por club.
- Fase 1: alta del jugador con categoría a validar, reserva de turnos de la grilla fija con precio por franja, cancelación con aviso, transferencia informada con comprobante, Mis reservas. Panel del club: grilla del día en vivo, carga de reservas, turnos fijos y bloqueos, cobros (confirmar, rechazar, efectivo, devoluciones), calendario, jugadores y ajustes.
