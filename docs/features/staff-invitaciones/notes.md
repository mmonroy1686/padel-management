---
feature: staff-invitaciones
type: note
date: 2026-11-24
branch: feat/staff-invitaciones
---

# staff-invitaciones — notas

## La invitación se acepta con un botón

`/invitacion` no acepta al cargarse: un prefetch de Next o un previsualizador de links aceptaría solo con abrir la
página. Acepta la acción **Aceptar invitación** y después lleva a `/club`.

## Solo se acepta con enlace mágico o Google

La revisión de disciplina encontró un agujero. Supabase deja crear cuentas con email y contraseña por la API, y con la
confirmación de email apagada (como en local) cualquiera podía registrarse con un email invitado que todavía no tenía
cuenta y aceptar la invitación. Con la del primer admin, se quedaba con el club.

`accept_staff_invitation` ahora mira cómo se inició la sesión (el `amr` del JWT). Acepta solo métodos que prueban que
la persona es dueña del email: enlace u OTP por mail (`otp`, `magiclink`, `email/signup`, `invite`, `recovery`) y
Google (`oauth`). Con contraseña falla con `sign_in_with_link`. El e2e confirma que el enlace mágico real de Supabase
pasa el chequeo. Además, las invitaciones las ve solo el admin (antes también recepción), y el trigger también mira los
cambios de `club_id` y `user_id`.

## El trigger del último admin y los borrados en cascada

`club_members_keep_an_admin` frena un cambio de rol o un borrado que deje al club sin admin. Dos borrados tienen que
pasar igual:
- **Una cuenta borrada** (service role, `auth.uid()` vacío), que es lo que hace la limpieza del e2e.
- **Un club borrado:** la cascada borra a sus miembros cuando la fila del club ya no está. El trigger bloquea la fila
  del club para que dos admins que se bajan a la vez no dejen el club vacío; si no la encuentra, deja pasar.

El primer intento solo miraba `auth.uid()`, y `court_delete.test.sql` lo encontró: borra el club con una sesión puesta.

## Una sola cola por tabla, el mismo envío

El mail de invitación no entra en `notifications`, porque esa tabla necesita un usuario y el invitado puede no tener
cuenta. `club_invitations` tiene sus propias columnas de cola, como `notifications`. `mailQueue` (el loop que antes
estaba dentro de `sendPending`) manda las dos, y `brandedEmail` (la plantilla que antes estaba dentro de `buildEmail`)
las arma.

## `set_member_role` y el propio rol

Antes un admin no podía cambiar su propio rol: era una forma de que el club no se quedara sin admin. Ahora eso lo
cuida el trigger. Un admin puede bajarse a recepción si queda otro admin, y así se pasa el club a otra persona.

## Lo que no se hizo

- El mail no avisa cuando a alguien le quitan el acceso.
- Una invitación aceptada o cancelada queda en la tabla como historial; la pantalla muestra solo las abiertas.
