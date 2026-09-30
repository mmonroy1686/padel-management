---
feature: fase-3a-torneos
type: note
date: 2026-09-30
branch: feat/fase-3a-torneos
---

# fase-3a-torneos — notes

(scratch, observations, links — append as you work)

## Desvíos durante la ejecución

- Task 3: `gh` no está instalado; el PR se abre desde GitHub.
- Task 22: en e2e, el indicador de desarrollo de Next tapa la pestaña Inicio en móvil; `player-booking.spec.ts` navega con `page.goto('/')`.

## 2026-09-30 — ejecución

- **Cortes 1–2 (base):** migraciones `20261001000200`–`250` tal cual el plan. pgTAP del fixture corrido tres veces seguidas en verde (orden al azar).
- **Cortes 3–4 (dominio, datos, acciones):** sin desvíos. `lib/domain/match-join.ts` sigue diciendo "reserva o partido" en su motivo local; el mensaje de la base (`busy_at_that_time`) ya menciona torneos.
- **Corte 5 (jugador):** Mis reservas pasó a Inicio. En e2e el indicador de desarrollo de Next tapa la pestaña Inicio en móvil: `player-booking.spec.ts` navega con `page.goto('/')`.
- **Corte 6 (club):** sin desvíos. La grilla ya traía el arreglo de ocupaciones de varios turnos (`685704a`, fuera del plan).
- **Corte 7 (e2e):** `tournament.spec.ts` en verde dos veces seguidas (la limpieza del global setup funciona).
- **Revisión de disciplina** (`team-reviewer`): sin críticos ni altos. Arreglos en `20261001000260_tournament_review_fixes.sql` y `tournament_review.test.sql`:
  - `drop_entry` bloquea los pagos informados antes que la inscripción (mismo orden que `confirm_payment`): baja y confirmación simultáneas ya no se bloquean entre sí.
  - `leave_tournament` exige que el torneo no haya empezado, aunque la inscripción siga abierta.
  - `start_tournament` recorta el horario del torneo y de sus canchas a lo que necesitan los anotados y rondas reales (un torneo de 16 que arranca con 8 libera canchas y jugadores antes).
  - Tests de staff de otro club en todas las funciones de torneos, y de "ocupado" que se libera al darse de baja o con el torneo cancelado.
  - El mensaje de baja avisa que el club devuelve lo pagado.
- Pendiente: `finish_tournament` no acorta el horario si se termina antes; queda para cuando Rustic lo pida.
