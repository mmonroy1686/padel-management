---
feature: alta-de-club
type: design
status: design
date: 2026-11-24
branch: feat/alta-de-club
references: ../../handoff/2026-11-23-validacion-y-multi-club.md, ../staff-invitaciones/design.md
---

# alta-de-club — diseño

## Para qué

Hoy un club nuevo se crea por SQL y se configura a mano. Con este corte, Miguel (super-admin de la plataforma) crea
un club desde un panel en dos minutos. El admin del club recibe la invitación y, la primera vez que entra, un
asistente lo lleva paso a paso hasta dejar el club listo para reservar. Así ningún club nuevo necesita código ni SQL.

## Principios

- **Super-admin no es un rol de club.** Es una tabla aparte (`platform_admins`) con `private.is_platform_admin()`.
  No da acceso al panel de ningún club: para operar un club, el super-admin se invita como admin, como cualquiera.
- **El asistente usa los mismos formularios que Ajustes.** Los formularios salen de las páginas a componentes, y
  Ajustes y el asistente usan los mismos. Lo que se arregla en uno queda arreglado en el otro.
- **Todo por RPC** `security definer` con errores estables, como siempre.
- **Lo mínimo para operar:** un club está operativo con **al menos una cancha y un precio**. El resto (horario, cobros,
  marca, recepción) tiene valores por defecto razonables y se puede saltear.

## Dónde vive el panel

- `PLATFORM_HOST` (variable de entorno) es el host donde se abre `/plataforma`: hoy `padel-management-one.vercel.app`,
  en local `localhost:3000`, y el dominio raíz cuando exista. En cualquier otro host, `/plataforma` da 404, así que
  nunca aparece en el subdominio de un club. Sin la variable, no hay panel.
- **Ingreso:** se entra con el mismo enlace mágico o Google. Como ese host hoy es el del club por defecto, el ingreso
  se ve con la marca de Rustic. Alcanza para el piloto; cuando haya dominio raíz, se ve neutro.
- `/plataforma` pide sesión y super-admin. Si no lo sos, da 404: no revela que existe.

## Datos

- `platform_admins (user_id primary key references profiles, created_at)`. RLS sin lectura ni escritura para nadie:
  solo `private.is_platform_admin()` (security definer) la consulta. **El primero se crea por SQL** (README).
- `clubs.setup_completed_at timestamptz`: cuándo el admin terminó (o cerró) el asistente. Los clubes que ya existen
  quedan marcados como terminados en la migración.

## Funciones

| RPC | quién | qué hace |
| --- | --- | --- |
| `create_club(slug, name, timezone, admin_email)` | super-admin | Valida el slug (mismo formato que el host, de 2 a 40 caracteres, no reservado, no usado) y crea el club con los valores por defecto. Crea la invitación de admin del corte 2, con su mail. Devuelve el club |
| `platform_clubs()` | super-admin | Cada club con: canchas activas, staff, invitaciones abiertas, reservas de los últimos 7 días, si terminó el asistente y su fecha de alta |
| `resend_admin_invitation(club_id)` | super-admin | Renueva y reenvía la invitación de admin abierta, por si el admin no la usó a tiempo |
| `finish_club_setup(club_id)` | admin del club | Marca `setup_completed_at` |

- **Slugs reservados:** `www`, `app`, `api`, `plataforma`, `admin`, `mail`, `static`, `assets`, `staging`, `status`.
- **Errores nuevos:** `slug_taken` («Ese nombre corto ya lo usa otro club.»), `slug_reserved` («Ese nombre corto está
  reservado, elegí otro.»), `invalid_slug` («Usá letras minúsculas, números y guiones, de 2 a 40 caracteres.»),
  `invalid_timezone`.

## Panel de plataforma

- **`/plataforma`:** una tabla de clubes con su estado, por ejemplo «Rustic Pádel · 3 canchas · 2 staff · 41 reservas
  en 7 días · listo», o «Club Demo · sin canchas · invitación pendiente». Cada club tiene su link
  (`https://<slug>.<dominio>`) y, si la invitación de admin está abierta, **Reenviar invitación**.
- **Nuevo club:** un formulario con nombre, nombre corto (el slug, que se sugiere solo a partir del nombre, por
  ejemplo «Pádel Norte» → `padel-norte`), zona horaria (lista corta: Montevideo, Buenos Aires, Asunción, Santiago,
  São Paulo) y email del admin.
  - Al crear, muestra el link del club y el de la invitación, para pasarlos por WhatsApp si el mail no llega.

## Asistente de alta (admin del club)

- **Cuándo aparece:** cuando el admin entra al panel (`/club/inicio`) de un club **sin `setup_completed_at`**, va a
  `/club/alta`. Recepción no lo ve; si el club todavía no tiene canchas, recepción ve un aviso de que el admin está
  terminando de configurarlo.
- **Pasos:** cada uno en `/club/alta/<paso>`, con una barra de progreso. Cada paso tiene **Guardar y seguir**,
  **Saltear** y **Terminar después** (este último vuelve al panel).
  1. **Canchas:** agregar una o más, con el formulario de Ajustes → Canchas.
  2. **Horario y turno:** apertura, cierre y duración del turno.
  3. **Precios por franja:** con el formulario de Ajustes → Canchas y precios.
  4. **Cobros:** efectivo y transferencia (con los datos de la cuenta). POS se suma en el corte 4.
  5. **Logo y colores.**
  6. **Invitar recepción:** el formulario de Ajustes → Staff.
- **Final:** **Listo** marca `setup_completed_at` y lleva al panel. Si falta una cancha o un precio, no deja terminar
  y dice qué falta, con un link a ese paso.
- **Retomar:** mientras no termine, el Inicio del panel muestra «Terminá de configurar el club (paso 3 de 6)» con un
  link.
- Los jugadores ven el club normalmente, aunque sin canchas la grilla queda vacía. No hay que tapar nada.

## README

- **Crear el super-admin:**

  ```sql
  insert into public.platform_admins (user_id)
  select id from auth.users where email = 'vos@ejemplo.com';
  ```

- `PLATFORM_HOST` en Vercel y en `.env.example`.
- El SQL del primer admin del corte 2 queda solo para casos especiales: ahora el admin sale de **Nuevo club**.

## Tests

- **pgTAP:**
  - Solo un super-admin ejecuta `create_club`, `platform_clubs` y `resend_admin_invitation`; un admin de club o un
    jugador recibe `forbidden`.
  - Un slug repetido da `slug_taken`, uno reservado `slug_reserved` y uno mal formado `invalid_slug`.
  - El club se crea con sus valores por defecto y con la invitación de admin encolada.
  - `finish_club_setup` es solo para el admin de ese club.
  - `platform_admins` no se lee por la API.
- **Unit:**
  - La sugerencia de slug desde el nombre.
  - El parser del formulario de **Nuevo club**.
  - Los pasos del asistente: el orden, el siguiente, qué falta para terminar.
  - El texto del estado de cada club.
  - El host de la plataforma.
- **e2e:** el super-admin crea «Club Demo» con `demo`. El admin entra por `demo.localhost:3000/invitacion`, completa el
  asistente (una cancha y un precio, el resto salteado) y un jugador reserva en ese club.

## Fuera de alcance

- Dar de baja o editar un club desde la plataforma (se hace por SQL si hace falta).
- Facturación o planes.
- Métricas más allá del estado de la tabla.
- Que el super-admin entre al panel de un club sin invitarse.
- POS en el paso de cobros: lo suma el corte 4.

## Preguntas abiertas

Ninguna que bloquee. Valores elegidos, que se pueden cambiar:
- `PLATFORM_HOST` para ubicar el panel.
- La lista de zonas horarias.
- Los slugs reservados.
- Lo mínimo para operar: una cancha y un precio.
