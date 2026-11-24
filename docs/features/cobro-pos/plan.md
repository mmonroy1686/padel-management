---
feature: cobro-pos
type: plan
status: in-progress
date: 2026-11-24
branch: feat/cobro-pos
references: ./design.md
---

# cobro-pos — plan

## Orden de trabajo

| # | paso | entrega | cómo se prueba |
| --- | --- | --- | --- |
| 1 | Base | `card` en `payment_method`; `clubs.accepts_card`; los cobros de mostrador reciben el medio | pgTAP `card_payments.test.sql` |
| 2 | Dominio | `DeskMethod`, `deskMethods(club)`, `readDeskMethod(form)`, texto de medios para el jugador, totales de Cobros por medio | Vitest |
| 3 | Ajustes | casilla POS en Pagos (y en el paso Cobros del asistente) | Vitest del parser |
| 4 | Recepción | POS en `ChargeChoice` (Inicio) y un botón por medio en Grilla, Cobros, torneos, campeonatos y day use; las acciones pasan `p_method` | Vitest de acciones y componentes |
| 5 | e2e | el admin activa POS, recepción cobra una parte con POS desde Inicio y la ve en Cobros | Playwright |
| 6 | Docs | README, notas | — |

## Criterios de aceptación

- [ ] Cobro con POS confirmado en el acto por recepción, en los cinco tipos de cobro.
- [ ] Rechazado con `method_disabled` si el club no tiene POS; un jugador no puede registrarlo.
- [ ] Cobros muestra el medio de cada pago y separa efectivo y POS en los totales.
- [ ] El jugador ve que puede pagar con tarjeta en el club.

## Revisiones del plan

- **v1 (2026-11-24)**: plan inicial.
