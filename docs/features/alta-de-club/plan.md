---
feature: alta-de-club
type: plan
status: in-progress
date: 2026-11-24
branch: feat/alta-de-club
references: ./design.md
---

# alta-de-club — plan de implementación

## Secuencia

| # | paso | entrega | cómo se prueba |
|---|---|---|---|
| 1 | Migración `20261126000100_platform`: `platform_admins`, `private.is_platform_admin()`, `public.is_platform_admin()`, `clubs.setup_completed_at` (los clubes de antes, terminados), `create_club`, `platform_clubs`, `resend_admin_invitation`, `finish_club_setup` (`setup_incomplete` sin cancha o sin precio). Tipos y errores | la base sabe crear clubes | pgTAP `platform.test.sql` |
| 2 | Host de la plataforma (`PLATFORM_HOST`), `/plataforma` con la tabla de clubes y **Nuevo club**; dominio (slug sugerido, parser, estado, zonas horarias); acciones | Miguel crea clubes | unit (dominio, host, acciones) |
| 3 | Los formularios de Ajustes pasan a componentes (canchas, horario y turno, precios, cobros, marca, invitar) sin cambiar nada de lo que se ve | se pueden reusar | Vitest y e2e de siempre en verde |
| 4 | Asistente `/club/alta/[paso]`: pasos, progreso, Saltear / Terminar después / Listo; `/club/inicio` manda al admin al asistente y muestra el aviso para retomar | el admin deja el club operativo | unit (pasos); e2e de punta a punta |
| 5 | README (super-admin, `PLATFORM_HOST`), `.env.example`, `notes.md`; app levantada en local | los pasos de Miguel | revisión y prueba en local |

## Criterios de aceptación

- [ ] e2e: el super-admin crea «Club Demo» con `demo`; el admin entra por `demo.localhost:3000/invitacion`, completa el asistente y un jugador puede reservar en ese club.
- [ ] Un usuario que no es super-admin no ve `/plataforma` ni puede ejecutar `create_club` (pgTAP; la página da 404).
- [ ] Slug repetido o reservado → error estable con mensaje claro.
- [ ] Ajustes se ve y funciona igual después de sacar los formularios a componentes.
- [ ] lint, typecheck, Vitest, pgTAP, build y e2e en verde; tipos regenerados.

## Revisiones del plan

- **v1 (2026-11-24)**: plan inicial.
