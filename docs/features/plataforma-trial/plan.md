---
feature: plataforma-trial
type: plan
status: done
date: 2026-11-27
branch: feat/plataforma-trial
references: ./design.md
---

# plataforma-trial: plan

## Build sequence

| # | Paso | Entrega | Cómo se prueba |
| --- | --- | --- | --- |
| 1 | Migración de cuenta y hitos | `club_accounts`, trigger, `platform_clubs` recreada, `platform_club_account`, `set_club_account_status`, `save_club_account_contact` | pgTAP `platform_accounts` |
| 2 | Migración de semanas | `platform_club_weeks` | pgTAP con reservas, cobros y faltazos armados |
| 3 | Migración de soporte | `support_since`, `platform_support_sessions`, `join_club_as_support`, `leave_club_support`, `club_staff` con `support` | pgTAP `platform_support` |
| 4 | Tipos y dominio | `db:types`; `lib/domain/platform.ts`: estado, prueba, hitos, próximo paso, semanas, parsers | Vitest |
| 5 | Datos y acciones | `lib/data/platform.ts`, `app/plataforma/actions.ts` | Vitest de acciones |
| 6 | Lista | `/plataforma` rediseñada | Vitest de componentes, captura |
| 7 | Ficha | `/plataforma/clubes/[slug]` | Vitest de componentes, captura |
| 8 | Staff «Soporte» | badge en Ajustes → Staff | Vitest |
| 9 | e2e y cierre | spec, notes.md, README | Playwright en modo CI |

## Acceptance criteria

- [ ] Un club nuevo nace en prueba por 60 días; los que existían arrancan hoy.
- [ ] La lista muestra estado, prueba, jugadores, reservas con % online y próximo paso de cada club.
- [ ] La ficha muestra hitos, 8 semanas de métricas, contacto y notas, y deja cambiar estado y fecha.
- [ ] Soporte entra y sale con un toque, queda registrado y el club lo ve como «Soporte».
- [ ] Nada de esto lo lee un admin de club.

## Plan revisions

- **v1 (2026-11-27)**: plan inicial.
