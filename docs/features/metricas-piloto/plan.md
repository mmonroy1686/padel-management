---
feature: metricas-piloto
type: plan
status: in-progress
date: 2026-11-25
branch: feat/metricas-piloto
references: ./design.md
---

# metricas-piloto: plan

## Orden de trabajo

| # | Paso | Qué queda | Cómo se prueba |
| --- | --- | --- | --- |
| 1 | Migración `20261129000100_no_show.sql` | Agrega a `bookings` las columnas `no_show_at` y `no_show_by`, con un check que las exige las dos o ninguna, y la RPC `mark_no_show(p_booking_id, p_no_show)` para staff | pgTAP `no_show.test.sql`: lo pueden usar recepción y admin; no lo pueden usar un jugador ni el staff de otro club; falla con una reserva cancelada o futura; deshacer funciona; marcar dos veces no cambia nada; la escritura directa da 42501 |
| 2 | Tipos y errores | `npm run db:types`. `invalid_state` ya tiene mensaje | tsc |
| 3 | Grilla | `GridBooking.noShow` sale de `lib/data/day.ts`. Acción `markNoShow` en `grilla/actions.ts`. En `occupancy-detail-sheet`, para un turno que ya empezó: «No vino», o «Marcada: no vino» con «Deshacer» | Vitest: el sheet muestra el botón según la hora y la marca; la acción valida la entrada y llama a la RPC |
| 4 | `docs/piloto/metricas.sql` | Las 7 consultas del diseño, con el club y las semanas parametrizados al principio | Correrlas contra el seed local (`demo:data`) con `psql`, con un ejemplo del resultado en comentarios. Pasar el `club_id` de Norte da solo datos de Norte |
| 5 | README y notas | README: cómo correr las métricas (las corre Miguel en el SQL Editor) y qué es «No vino». `notes.md` | — |
| 6 | Revisión | team-reviewer y arreglos | pgTAP, Vitest, lint, tsc, build y e2e del cobro y de la grilla de recepción |

## Criterios de aceptación

- [ ] Cada consulta corre sin errores en el seed local, devuelve datos de un solo club y respeta su zona horaria.
- [ ] Recepción marca y desmarca «No vino» sobre una reserva que ya empezó. No puede hacerlo sobre una futura ni sobre una cancelada.
- [ ] Ni los pagos ni la ocupación cambian al marcar «No vino».

## Revisiones del plan

- **v1 (2026-11-25)**: plan inicial.
