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

#### Varios clubes en local

Cada club vive en su subdominio. En local, `<club>.localhost:3000` (los navegadores lo resuelven solos); `localhost:3000` es el club de `DEFAULT_CLUB_SLUG` (Rustic). El seed trae un segundo club, **Pádel Norte**:

```bash
npm run demo:users -- --club=norte   # admin@norte.test, recepcion@norte.test, jugador@norte.test
npm run dev:local                    # http://norte.localhost:3000 y http://rustic.localhost:3000
```

La sesión es una por club: entrar a otro club pide ingresar de nuevo, con la misma cuenta. La primera vez, ese club muestra su propia bienvenida (la categoría es por club). Un subdominio sin club da 404 "Club no encontrado".

El seed local trae a Rustic con los valores del prototipo: 3 canchas, 08:00 a 23:00, turnos de 90 minutos, $1.200 y $1.600 desde las 18:30.

### Producción

Un usuario pasa a `club_members` cuando completa la bienvenida. Para dar rol de admin a una cuenta (Supabase → SQL Editor):

```sql
update public.club_members m set role = 'admin'
from auth.users u where u.id = m.user_id and u.email = 'vos@ejemplo.com';
```

#### Un club por subdominio (dominio y Vercel)

Cada club se abre en `https://<slug>.<dominio>`. Hasta tener el dominio, todo sigue en el club de `DEFAULT_CLUB_SLUG`. Para pasar a subdominios:

1. **Dominio:** en Vercel → Settings → Domains, agregar `<dominio>` y `*.<dominio>`. El comodín necesita que el dominio use los nameservers de Vercel.
2. **Variables en Vercel** (Production y Preview): `NEXT_PUBLIC_ROOT_DOMAIN=<dominio>` y `DEFAULT_CLUB_SLUG=rustic`. Volver a desplegar.
3. **Supabase → Authentication → URL Configuration:** Site URL `https://rustic.<dominio>`; en Redirect URLs agregar `https://*.<dominio>/**` (dejar las actuales hasta terminar la mudanza).
4. **Google** (si se usa para ingresar): no cambia, el callback lo maneja Supabase.

Sin subdominio (el dominio pelado, `www`, `*.vercel.app` y las previews) se ve el club de `DEFAULT_CLUB_SLUG`. Los links que la gente comparte y los de los avisos por email apuntan al subdominio de cada club.

#### Email de inicio de sesión (SMTP propio)

El SMTP que trae Supabase solo envía a miembros del equipo y muy pocos emails por hora: antes del piloto hay que usar Resend, el mismo que ya manda los avisos. En Supabase → Authentication → Emails → SMTP Settings:

| Campo | Valor |
| --- | --- |
| Enable custom SMTP | activado |
| Sender email | una dirección del dominio verificado en Resend (la misma de `EMAIL_FROM`) |
| Sender name | el nombre del club o del producto |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | una API key de Resend (puede ser la de `RESEND_API_KEY` o una solo para Auth) |

Después, en Authentication → Rate Limits, subir "Rate limit for sending emails" (por defecto es muy bajo para un club entero). Probarlo pidiendo un enlace de ingreso con un email que no sea del equipo.

#### Monitoreo de errores (Sentry)

Sin variables, no se envía nada. Para prenderlo, crear un proyecto Next.js en Sentry y cargar en Vercel (Production y Preview):

| Variable | Para qué |
| --- | --- |
| `NEXT_PUBLIC_SENTRY_DSN` | El DSN del proyecto. Con esto ya se reportan los errores del servidor y del navegador |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Opcionales: suben los source maps en el build, para ver en qué línea del código falló |

Solo se mandan errores, sin grabación de sesiones ni medición de rendimiento. Antes de enviar cada error se borran los emails y teléfonos que aparezcan en él (`lib/observability/scrub.ts`), y no van las líneas de la consola del navegador. Los deploys de preview quedan separados de producción por `VERCEL_ENV`. Las alertas (mail cuando aparece un error nuevo) se configuran en el panel de Sentry.

`NEXT_PUBLIC_SENTRY_DSN` queda fija en el código del navegador al hacer el build: después de cargarla o cambiarla en Vercel, hay que volver a desplegar.

#### Backups

`backup.yml` corre los lunes a las 03:00 (Montevideo): hace un dump de producción (roles, esquema y datos), lo cifra con `BACKUP_PASSPHRASE` y lo guarda 90 días como artifact del workflow. **Los archivos subidos (logos, comprobantes, afiches) no están en el backup**: solo sus registros en la base.

Para restaurar uno en el Supabase local (para revisarlo o recuperar datos):

```bash
# 1. Bajar el artifact supabase-backup-<id> desde GitHub → Actions → Backup production y descomprimir el .zip
#    FUERA del repo (son datos personales reales), por ejemplo en ~/backups/2026-11-23
cd ~/backups/2026-11-23
gpg --decrypt backup.tar.gz.gpg | tar xz   # pide la BACKUP_PASSPHRASE
# 2. Cargarlo en la base local (borra lo que haya en ella), desde el repo
npx supabase start
npm run db:restore -- ~/backups/2026-11-23
npm run dev:local
```

Si igual lo descomprimís en una carpeta `backup/` dentro del repo, `.gitignore` la deja afuera. Borrá los archivos descifrados cuando termines.

`db:restore` recrea la base local con las migraciones, sin seed, y carga `data.sql`. Supabase en la nube usa versiones de Auth y Storage más nuevas que el CLI: las tablas y columnas que el local no tiene se saltean y el script las lista (son internas, no datos de la app). Nunca toca una base remota.

Para recuperar producción entera en un proyecto nuevo de Supabase, se usan los tres archivos en orden, como indica la guía de Supabase de backup y restore con el CLI: `roles.sql`, `schema.sql` y `data.sql` con `SET session_replication_role = replica`. Eso lo corre Miguel.

#### Términos y privacidad

`/terminos` y `/privacidad` son un **borrador** para Uruguay (Ley 18.331), no asesoramiento legal. Cada dato que falta aparece como `[COMPLETAR: …]` y la página avisa que es un borrador hasta que no quede ninguno. El texto está en `lib/legal/documents.ts`; el nombre del producto sale de `NEXT_PUBLIC_PRODUCT_NAME`.

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo (usa `.env.local`) |
| `npm run dev:local` | Servidor de desarrollo contra Supabase local |
| `npm run demo:users` | Crea admin, recepción y jugador demo en la base local (`-- --club=<slug>` para otro club) |
| `npm run lint` / `npm run typecheck` | ESLint y TypeScript |
| `npm test` | Vitest (`tests/unit`) |
| `npm run test:db` | pgTAP (`supabase/tests`) |
| `npm run test:e2e` | Playwright (`tests/e2e`), necesita Supabase local |
| `npm run db:reset` | Recrea la base local con migraciones y `seed.sql` |
| `npm run db:types` | Regenera `lib/supabase/database.types.ts` |
| `npm run db:restore -- <carpeta>` | Carga un backup de producción descifrado en el Supabase local |

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
