---
type: handoff
date: 2026-11-23
status: ready
owner: Miguel
references: ../plan-general.md, ../ux-audit-2026-10.md, https://claude.ai/artifact/VtnATbz8CtakgVz4DRbeKQ
---

# Handoff: validar con un club y hacer la app multi-club

Este documento es el punto de partida para el agente. Leelo entero antes de tocar código.
El estudio completo (evaluación, competencia y roadmap) está en el doc "Rustic Pádel: evaluación, competencia y roadmap" (link en `references`).

## Objetivo

Dejar la app lista para que **un club de la ciudad la pruebe y la valide**, y que sumar clubes nuevos no requiera tocar código.
Hoy la app sirve a un solo club: `lib/club/config.ts` tiene `CLUB_SLUG = 'rustic'` fijo y el admin se crea a mano por SQL.

## Decisiones tomadas (no se discuten en este trabajo)

| Tema | Decisión |
| --- | --- |
| Validación | Un club de la ciudad la prueba antes de salir a vender |
| Cobro | Solo en el local: efectivo, transferencia y **POS (tarjeta en recepción)**. Sin pago online |
| Multi-club | Sí. Un club por subdominio. Una cuenta de jugador sirve para varios clubes |
| Staff | Admin y recepción **no necesitan perfil de jugador** |
| Avisos | Solo email con Resend, como hoy. Nada de WhatsApp |
| Nombre de producto | Todavía no está elegido (candidato: Pique). Todo lo que dependa del nombre o del dominio va por variable de entorno |

## Fuera de alcance

Mercado Pago o cualquier pago online, WhatsApp y push, clases, abonos, rating, cantina, app en tiendas, reportes del dueño e ingreso por código. Son etapas siguientes del roadmap; no adelantar nada de eso.

## Reglas del repo (resumen; la fuente es el README y los plan.md anteriores)

- Todo entra a `main` por PR con CI en verde (`quality`, `db-and-e2e`). `gh` no está instalado: los PR los abre Miguel desde GitHub.
- Next 16 no es el Next que conocés: antes de usar una API, leer su guía en `node_modules/next/dist/docs/` (ver `AGENTS.md`). Para este trabajo importan `proxy.ts` (reemplaza a middleware), `headers()`, `generateMetadata`, `manifest.ts` y Route Handlers.
- Reservas, cobros, membresías y cualquier escritura sensible van **solo** por funciones de Postgres `security definer` con `search_path = ''` y errores estables con `private.fail(code)`, traducidos en `lib/domain/errors.ts`. Un código nuevo va en los dos lados.
- Cambios de esquema: migración nueva en `supabase/migrations`, test pgTAP, `npm run db:reset` y `npm run db:types` (CI compara los tipos byte a byte). Una migración ya aplicada no se edita.
- **Un valor nuevo de enum va solo en su propia migración** (Postgres no deja usarlo en la misma transacción; ya pasó con `hold`).
- Migraciones compatibles hacia atrás: Vercel y la migración se despliegan en paralelo.
- **Nunca** correr nada contra producción (`supabase link`, `db push`, SQL remoto). Miguel corre los comandos de producción.
- Windows: archivos con barras invertidas (`\ir` en pgTAP, regex) se escriben con la herramienta Write, no con heredoc ni `sed`. Rutas con paréntesis o corchetes entre comillas.
- Docs en español rioplatense; identificadores, comentarios de código y SQL, y mensajes de commit en inglés.
- Cada feature sigue el flujo de las anteriores: `docs/features/<feature>/design.md` (lo aprueba Miguel) → `plan.md` → implementación por cortes chicos, cada corte en verde → `notes.md`.

## Orden de trabajo

| Corte | Qué | Rama | Esfuerzo estimado (h) |
| --- | --- | --- | --- |
| 0 | Ordenar la base | varias, ver abajo | 20–25 |
| 1 | Multi-club por subdominio | `feat/multi-club` | 25–30 |
| 2 | Staff sin perfil de jugador, por invitación | `feat/staff-invitaciones` | 12–15 |
| 3 | Super-admin y alta de club guiada | `feat/alta-de-club` | 18–25 |
| 4 | POS como medio de cobro | `feat/cobro-pos` | 6–8 |
| 5 | Datos del club para el jugador (mapa, fotos, WhatsApp) | `feat/datos-del-club` | 12–16 |

Los cortes 1 a 4 se hacen en ese orden porque cada uno se apoya en el anterior. No empezar el 1 hasta que el 0 esté en `main`.

---

## Corte 0: ordenar la base

### 0.1 Integrar las ramas abiertas

`main` no recibe cambios desde el 17/11. Estado al 23/11:

| Rama | Commits fuera de `main` | Nota |
| --- | --- | --- |
| `feat/asistente-del-club` | 22 | **Contiene a `feat/inicio-cancha`** (sus 10 commits posteriores al PR #28). Mergear esta y cerrar `inicio-cancha` |
| `feat/cobros-tablero` | 10 | Sale de `main` |
| `feat/campeonato-publico` | 1 | Rama actual. Hay un cambio sin commitear en `supabase/config.toml`: preguntarle a Miguel si va o se descarta |
| `feat/campeonato-preview-afiche` | 1 | Sale de `main` |
| `feat/torneos-cards` | 1 | Sale de `main` |
| `feat/pc-layout` | 1 | Del 01/10, sobre una base vieja. Revisar si sigue teniendo sentido; si no, proponer descartarla |

Orden sugerido: `asistente-del-club`, `cobros-tablero`, `campeonato-publico`, `campeonato-preview-afiche`, `torneos-cards`. Rebasear cada una sobre `main` actualizado, correr lint, typecheck, `npm test`, `npm run test:db` y `npm run test:e2e`, y dejar el PR listo para que Miguel lo abra. Si dos ramas tocan las mismas migraciones o el mismo componente, resolver respetando la última intención y anotarlo en el PR.

### 0.2 Operación

- **Monitoreo de errores:** integrar Sentry (o equivalente) detrás de una variable de entorno; sin la variable la app funciona igual. Miguel crea la cuenta y carga el DSN.
- **Backups:** revisar `backup.yml` y documentar en el README cómo restaurar un dump en el Supabase local. Probarlo una vez de punta a punta.
- **Email:** dejar documentado en el README el paso de SMTP propio en Supabase (Authentication → Emails). Lo hace Miguel en el panel.
- **Términos y privacidad:** páginas `/terminos` y `/privacidad` con un borrador en español que Miguel revisa. Marcar en el texto lo que hay que completar (razón social, contacto). No es asesoramiento legal.

**Terminado cuando:** las ramas están integradas o descartadas con motivo, CI en verde en `main` y Miguel puede desplegar a Vercel desde `main`.

---

## Corte 1: multi-club por subdominio

### Situación actual

- La base ya está preparada: todas las tablas tienen `club_id`, RLS y las funciones usan el club de cada fila. Los helpers de RLS (`private.is_club_member`, `private.has_club_role`, `private.is_staff`) ya son por club. Los jobs de `pg_cron` (`extend_all_series`, etc.) recorren todos los clubes.
- El fixture pgTAP ya tiene un segundo club (club B, con Eva como admin): usarlo para tests de aislamiento.
- En la app, el club sale de `CLUB_SLUG` a través de `getClub()` en `lib/auth/viewer.ts`. Encontrar todos los usos con `grep -rn "getClub\|CLUB_SLUG" app lib components scripts`. Hoy incluye: `app/layout.tsx`, `app/manifest.ts`, `app/(jugador)/layout.tsx`, `app/auth/ingreso/page.tsx`, `app/c/[code]/layout.tsx`, `lib/brand/load-brand.ts`, `lib/data/share-preview.ts`.

### Qué hay que construir

1. **Resolver el club por host** en `proxy.ts`: `<slug>.<ROOT_DOMAIN>` → slug. Pasarlo a la request (por ejemplo, header `x-club-slug`) y que `getClub()` lo lea con `headers()`. Borrar `CLUB_SLUG`.
2. **Variables de entorno nuevas:** `NEXT_PUBLIC_ROOT_DOMAIN` (dominio del producto, todavía sin definir) y `DEFAULT_CLUB_SLUG` (fallback cuando el host no trae subdominio: `localhost`, `*.vercel.app` o previews). Con `DEFAULT_CLUB_SLUG=rustic`, todo lo que hoy funciona sigue igual.
3. **Desarrollo local:** `rustic.localhost:3000` y `<otro>.localhost:3000` tienen que andar. Actualizar `scripts/dev-local.mjs` y el README.
4. **Club inexistente:** un subdominio sin club muestra una página "Club no encontrado" con 404, no un error 500. Hoy `getClub()` tira un error.
5. **Marca por club:** layout, metadata, viewport, `manifest.ts` y las imágenes OG salen del club del host. Cada subdominio se instala como su propia PWA.
6. **Páginas públicas de campeonato (`/c/[code]`):** la marca sale del club **dueño del campeonato**. Si el campeonato es de otro club que el del host, redirigir al host correcto.
7. **Links en emails y redirects de Auth:** todo link que hoy arma URL con `NEXT_PUBLIC_SITE_URL` pasa a usar la URL del club (`https://<slug>.<ROOT_DOMAIN>`). Revisar `lib/notify/*`, `app/auth/callback/route.ts`, `lib/auth/redirect.ts` y las imágenes para compartir.
8. **Jugador en varios clubes:** la cuenta y el perfil (`profiles`) son uno solo; la membresía y la categoría son por club (`club_members`, como hoy). Si alguien ya logueado entra a otro club, ve la bienvenida de ese club. Sesión: una cookie por host (lo más simple y seguro); si se quiere compartir sesión entre subdominios, se propone en el design y lo decide Miguel.
9. **Seed y demo:** un segundo club en `seed.sql` y en `scripts/demo-*.mjs` para probar a mano y en e2e.

### Lo que hace Miguel fuera del repo

Dominio con wildcard en Vercel (`*.<dominio>`), URLs de redirect con comodín en Supabase Auth y variables de entorno en Vercel. El design.md tiene que listar estos pasos exactos.

### Criterios de aceptación

- Con dos clubes en la base local, `a.localhost:3000` y `b.localhost:3000` muestran cada uno su marca, canchas, grilla y jugadores, y ninguno ve datos del otro.
- pgTAP: un admin del club A no puede leer ni escribir nada del club B a través de ninguna tabla ni función nueva (ampliar los tests de aislamiento existentes si falta alguno).
- e2e: un jugador reserva en el club A, entra al club B, completa la bienvenida de B y reserva ahí; "Mis reservas" de cada club muestra solo las suyas.
- Sin subdominio, con `DEFAULT_CLUB_SLUG=rustic`, todos los e2e actuales pasan sin cambios.
- Subdominio inexistente → 404 "Club no encontrado".
- `grep -rn CLUB_SLUG` no devuelve nada.

---

## Corte 2: staff sin perfil de jugador, por invitación

### Situación actual

La membresía nace en `save_my_profile` / `set_my_category`, siempre con rol `player` y categoría obligatoria (1 a 8). Para tener un admin hoy hay que completar la bienvenida de jugador y después correr el SQL del README. `club_members.category` ya admite `null`.

### Qué hay que construir

1. **Invitaciones:** tabla `club_invitations` (club, email, rol `admin` o `reception`, quién invitó, vencimiento, aceptada). RPC `invite_staff`, solo para admin. Manda un email por la outbox actual con el link al club.
2. **Aceptar:** al iniciar sesión con el email invitado (enlace mágico o Google), una RPC crea o actualiza la membresía con ese rol y **sin categoría**, y marca la invitación como aceptada. No pasa por la bienvenida de jugador.
3. **Guardas:** `requireStaff` no redirige nunca a `/bienvenida`. `requirePlayer` sigue igual para reservar, sumarse a partidos, torneos y day use. Si alguien del staff quiere jugar, completa su perfil desde el área de jugador cuando quiera.
4. **Gestión de staff en Ajustes:** listar el staff, invitar, reenviar, cancelar una invitación, cambiar rol y quitar acceso. Un club **no puede quedarse sin admin** (error estable `last_admin`).
5. **Navegación:** el staff sin perfil de jugador entra directo al panel (`/club`); el área de jugador le muestra la bienvenida solo si la abre.
6. Reemplazar en el README el SQL manual de admin por el flujo de invitación.

### Criterios de aceptación

- Un admin invita a `recepcion@...`; esa persona entra por el link y llega al panel sin que se le pida lado, mano, género ni categoría.
- Recepción no puede invitar ni cambiar roles (pgTAP + e2e).
- Una invitación vencida o cancelada no da acceso.
- Quitarle el rol al último admin falla con `last_admin`.
- Un jugador existente invitado como recepción conserva su categoría y su historial.

---

## Corte 3: super-admin y alta de club guiada

### Qué hay que construir

1. **Super-admin de la plataforma:** tabla `platform_admins (user_id)` y `private.is_platform_admin()`. No es un rol de club. El primero se crea por SQL (documentarlo en el README).
2. **Panel de plataforma** en el dominio raíz (`<ROOT_DOMAIN>/plataforma`; en local, `localhost:3000/plataforma` con una variable que lo habilite): lista de clubes con estado (canchas cargadas, staff, reservas de la última semana) y botón **Nuevo club**.
3. **Crear club:** RPC `create_club` (slug, nombre, zona horaria, email del admin) con valores por defecto razonables. Crea la invitación de admin del corte 2. Valida el formato del slug y que no esté usado, y reserva slugs como `www`, `app`, `api` y `plataforma`.
4. **Alta guiada para el admin nuevo:** al entrar por primera vez a un club sin canchas, un asistente de pasos: canchas → horario y duración del turno → precios por franja → medios de cobro (efectivo, transferencia con datos de la cuenta, POS) → logo y colores → invitar recepción. Reutilizar los formularios de Ajustes (en `feat/asistente-del-club` Ajustes ya tiene menú lateral y una pantalla por grupo). Se puede saltear y retomar; al terminar, el club queda operativo.

### Criterios de aceptación

- e2e: el super-admin crea "Club Demo" con `demo`; el admin recibe el email, entra a `demo.localhost:3000`, completa el asistente y un jugador puede reservar en ese club.
- Un usuario que no es super-admin no ve `/plataforma` ni puede ejecutar `create_club` (pgTAP).
- Slug repetido o reservado → error estable con mensaje claro.

---

## Corte 4: POS como medio de cobro

### Situación actual

`public.payment_method` es `('cash', 'transfer')`. `clubs` tiene `accepts_cash` y `accepts_transfer`, con un check de que al menos uno esté activo. Los cobros en efectivo los registra recepción y quedan confirmados en el momento; ese es el modelo a copiar.

### Qué hay que construir

1. Migración **solo** con `alter type public.payment_method add value 'card'`.
2. Otra migración con `clubs.accepts_card boolean not null default false`. Actualizar el check para que acepte cualquiera de los tres. Agregar las funciones de cobro con POS siguiendo el camino del efectivo en reservas, partes por jugador, partidos, torneos, campeonatos y day use. Fallar con `method_disabled` si el club no lo acepta.
3. UI: la opción **POS** aparece en la elección de cobro de recepción (`components/club/charge-choice.tsx` y equivalentes) solo si el club la tiene activa; Cobros y los totales del día separan por medio; Ajustes la activa o desactiva.
4. El jugador no paga con POS desde la app: solo ve "Pagás en el club" cuando el club acepta efectivo o POS.

### Criterios de aceptación

- pgTAP: cobro con POS confirmado en el acto por recepción; rechazado si `accepts_card` está apagado; un jugador no puede registrarlo.
- e2e: recepción cobra una parte con POS desde el Inicio y aparece en Cobros con su medio.

---

## Corte 5: datos del club para el jugador

Hecho (2026-11-24) en `feat/datos-del-club`, rebasado sobre `main` después del merge del corte 4 (#41). Plan y notas en `docs/features/datos-del-club/`. Falta el PR.

---

## Preguntas abiertas para Miguel (preguntar, no suponer)

1. ¿El cambio sin commitear de `supabase/config.toml` va o se descarta?
2. ¿`feat/pc-layout` se integra o se descarta?
3. ¿Sesión compartida entre subdominios o una por club? (Propuesta por defecto: una por club.)
4. Nombre y dominio del producto: hasta que estén, todo usa `NEXT_PUBLIC_ROOT_DOMAIN`.

## Definición de terminado (para todo el handoff)

- Cada corte con su `design.md`, `plan.md` y `notes.md` en `docs/features/<feature>/`.
- CI en verde y PR listo por corte.
- README actualizado: variables nuevas, desarrollo local con subdominios, alta de super-admin, invitaciones y pasos de Miguel en Vercel y Supabase.
- Un club nuevo se puede dar de alta y operar sin tocar código ni SQL.
