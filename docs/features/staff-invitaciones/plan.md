---
feature: staff-invitaciones
type: plan
status: in-progress
date: 2026-11-24
branch: feat/staff-invitaciones
references: ./design.md
---

# staff-invitaciones — plan de implementación

## Secuencia

| # | paso | entrega | cómo se prueba |
|---|---|---|---|
| 1 | Migración `20261125000100_staff_invitations`: tabla `club_invitations` con RLS, trigger `last_admin`, `set_member_role` sin el bloqueo a uno mismo, `remove_staff`, `invite_staff`, `resend_staff_invitation`, `cancel_staff_invitation`, `accept_staff_invitation`, `claim_invitation_emails`, `finish_invitation_email`. Tipos y códigos de error | la base sabe invitar y aceptar | pgTAP `staff_invitations.test.sql`; `members.test.sql` actualizado |
| 2 | Mail: la plantilla de marca sale de `buildEmail` (`brandedEmail`); `buildInvitationEmail`; `flushOutbox` vacía también la cola de invitaciones | llega el mail «Te invitaron…» | unit (`messages`, `send-pending`, invitaciones) |
| 3 | `/invitacion` (pide sesión, acepta y lleva a `/club`, o explica por qué no); el Inicio manda al staff sin perfil a `/club` | se entra por invitación sin bienvenida | unit (texto del resultado); e2e |
| 4 | Ajustes → Staff: carga del staff y de las invitaciones, parser del formulario, acciones (invitar, reenviar, cancelar, copiar link, cambiar rol, quitar acceso) y pantalla | el admin gestiona su staff | unit (dominio, acciones, componentes); e2e |
| 5 | README (SQL del primer admin = invitación), `.env.example` si hace falta, `notes.md` | los pasos de Miguel | revisión |

## Criterios de aceptación

- [ ] Un admin invita a recepción; esa persona entra por el link y llega al panel sin que se le pida lado, mano, género ni categoría (e2e).
- [ ] Recepción no puede invitar ni cambiar roles (pgTAP + e2e).
- [ ] Una invitación vencida o cancelada no da acceso (pgTAP + e2e para la cancelada).
- [ ] Quitarle el rol al último admin falla con `last_admin`, por RPC y por SQL directo (pgTAP).
- [ ] Un jugador existente invitado como recepción conserva su categoría y su historial (pgTAP).
- [ ] lint, typecheck, Vitest, pgTAP, build y e2e en verde; tipos de la base regenerados.

## Revisiones del plan

- **v1 (2026-11-24)**: plan inicial.
