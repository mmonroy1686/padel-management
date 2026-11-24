---
feature: staff-invitaciones
type: design
status: approved
date: 2026-11-24
branch: feat/staff-invitaciones
references: ../../handoff/2026-11-23-validacion-y-multi-club.md
---

# staff-invitaciones — diseño

## Para qué

Hoy un admin se crea completando la bienvenida de jugador (lado, mano, género, categoría) y corriendo SQL a mano. Con
este corte el admin invita a su staff por email desde Ajustes. La persona entra por el link, llega directo al panel y
nunca se le pide el perfil de jugador. Es lo que necesita el corte 3: `create_club` crea la invitación del primer admin.

## Principios

- **La invitación se acepta con el email, no con un token.** El link del mail lleva a `<club>/invitacion`. Ahí la
  persona inicia sesión como siempre (enlace mágico o Google) y la RPC busca una invitación vigente para el email de la
  sesión. La sesión tiene que venir de un enlace por mail o de Google (el `amr` del JWT): una sesión con contraseña no
  prueba que el email sea de esa persona. No hay secretos en la URL; un mail reenviado no sirve si no se
  entra con ese email.
- **Todo por RPC** `security definer`, con errores estables en `private.fail` y `lib/domain/errors.ts`.
- **Que un club se quede sin admin lo impide la base, no la pantalla.** Un trigger en `club_members` frena cualquier
  cambio que deje al club sin admin (`last_admin`), venga de donde venga: RPC, Jugadores o SQL.
- **Ser staff no borra lo de jugador.** Al aceptar se cambia solo el rol: la categoría y el historial quedan. Quitar
  el acceso devuelve a la persona a jugador, no la borra.

## Datos

Tabla `club_invitations`:

| columna | qué |
| --- | --- |
| `id`, `club_id` | |
| `email` | en minúsculas, sin espacios |
| `role` | `admin` o `reception` (check) |
| `invited_by` | perfil que invitó |
| `created_at`, `expires_at` | vence a los **7 días**; reenviar renueva el plazo |
| `accepted_at`, `accepted_by`, `cancelled_at` | estado final |
| `email_status`, `email_attempts`, `email_locked_until`, `emailed_at` | la misma cola que `notifications` |

- Una sola invitación abierta por club y email (índice único parcial sobre las que no están aceptadas ni canceladas).
- RLS: el staff del club la lee; nadie escribe directo.

## Funciones

| RPC | quién | qué hace |
| --- | --- | --- |
| `invite_staff(club, email, role)` | admin | crea la invitación (o renueva la abierta) y la encola para mail. `already_staff` si ese email ya es staff del club |
| `resend_staff_invitation(id)` | admin | renueva el vencimiento y vuelve a encolar el mail |
| `cancel_staff_invitation(id)` | admin | la cancela |
| `accept_staff_invitation(club)` | cualquiera con sesión | busca la invitación vigente para el email de la sesión. Crea la membresía con ese rol y sin categoría, o le cambia el rol a la que ya existe. La marca aceptada. `invitation_not_found` si no hay una vigente |
| `set_member_role(club, user, role)` | admin | ya existe. Deja de prohibir cambiarse a sí mismo y pasa a depender de `last_admin` (así un admin puede pasarle el club a otro y bajar a recepción) |
| `remove_staff(club, user)` | admin | vuelve a la persona `player`; `last_admin` si era el único admin |
| `claim_invitation_emails` / `finish_invitation_email` | service role | la cola de mails, igual que la de avisos |

Trigger `club_members_keep_an_admin`: antes de un `update` de rol o un `delete`, si el club quedaría sin ningún
admin, falla con `last_admin`.

## Mail

`flushOutbox` también vacía la cola de invitaciones, con la misma plantilla de marca del club. Por ejemplo: «Te
invitaron a sumarte a Rustic Pádel como recepción», con un botón **Aceptar invitación** a `<club>/invitacion` y la
aclaración de entrar con ese email. Sin remitente configurado (local sin Resend) se omite, igual que los avisos: el
admin igual puede pasar el link a mano. Ajustes lo muestra con un botón para copiarlo.

## Pantallas

- **`/invitacion`:** pide sesión (vuelve acá después del ingreso) y acepta.
  - Si sale bien, lleva a `/club` con «Listo, ya sos recepción en Rustic Pádel».
  - Si no hay invitación vigente, dice «No encontramos una invitación vigente para `<email>`. Puede haber vencido o
    estar cancelada; pedile al club que te invite de nuevo», con la opción de salir y entrar con otro email.
- **Ajustes → Staff** (sección nueva, solo admin):
  - La lista del staff (nombre o email, rol) con **Cambiar rol** y **Quitar acceso**.
  - Las invitaciones abiertas (email, rol, «vence el …» o «vencida») con **Reenviar**, **Cancelar** y **Copiar link**.
  - Un formulario **Invitar**, con email y rol.
- **Inicio (`/`):** el staff sin perfil de jugador va a `/club` en vez de a la bienvenida. Las pantallas de jugador
  (reservar, partidos, torneos, day use) siguen pidiendo la bienvenida con `requirePlayer`, así que el staff completa
  su perfil solo si las abre.
- **Jugadores:** el cambio de rol que ya tiene pasa a mostrar el error `last_admin`.

## Errores nuevos

| código | mensaje |
| --- | --- |
| `last_admin` | El club tiene que tener al menos un admin. Nombrá otro admin antes. |
| `already_staff` | Esa persona ya es parte del staff del club. |
| `invitation_not_found` | No encontramos una invitación vigente para tu email. |
| `invalid_email` | Revisá el email. |

## README

- El SQL manual para crear un admin pasa a ser un `insert` en `club_invitations`. Sigue haciendo falta para el
  **primer** admin de un club hasta el corte 3.
- Después la persona entra a `<club>/invitacion`.

## Tests

- **pgTAP:**
  - Solo el admin invita, reenvía, cancela, cambia roles y quita acceso; recepción recibe `forbidden`.
  - Aceptar con otro email, vencida o cancelada da `invitation_not_found`.
  - Un jugador invitado como recepción conserva su categoría.
  - `last_admin` sale por RPC y por `update` o `delete` directo.
  - La cola de mails la toma una sola vez.
- **Unit:** el mail de invitación, el parser del formulario, la lista de staff y los mensajes de error.
- **e2e:**
  - El admin invita a recepción, que entra por `/invitacion` y llega al panel sin bienvenida.
  - Recepción no ve Ajustes → Staff.
  - Una invitación cancelada no da acceso.

## Fuera de alcance

- Invitar jugadores.
- Varios clubes en una misma invitación.
- Pasar la propiedad del club con un paso aparte: alcanza con nombrar a otro admin.
- Avisar por mail cuando te quitan el acceso.

## Preguntas abiertas

Ninguna que bloquee. Valores elegidos, que se pueden cambiar:
- La invitación vence a los 7 días.
- Quitar el acceso devuelve a la persona a jugador.
- Un admin puede bajarse a sí mismo si queda otro admin.
